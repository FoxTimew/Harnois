import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { userMutationSchema, recordId } from "@/lib/admin-validation";
import { userQuerySchema } from "@/lib/table-query";
import {
  lockUsers,
  serviceAccess,
  type Actor,
} from "@/server/auth/service-access";
import { ServiceError } from "./errors";
import { writeAudit } from "./audit";
import { lockStaff } from "@/server/locks";

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  employeeId: true,
  mfaEnforced: true,
  employee: { select: { id: true, firstName: true, lastName: true } },
  totpFactor: { select: { confirmedAt: true } },
  _count: { select: { webauthnCredentials: true } },
} satisfies Prisma.UserSelect;

export async function listUsers(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const query = userQuerySchema.parse(input);
  return db.$transaction(
    async (tx) => {
      await serviceAccess(tx, actor, { action: "read", resource: "users" });
      const where: Prisma.UserWhereInput = {
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: "insensitive" } },
                {
                  email: {
                    contains: query.q.toLowerCase(),
                    mode: "insensitive",
                  },
                },
              ],
            }
          : {}),
        ...(query.role ? { role: query.role } : {}),
        ...(query.active ? { isActive: query.active === "true" } : {}),
      };
      const total = await tx.user.count({ where });
      const rows = await tx.user.findMany({
        where,
        select: userSelect,
        orderBy: [{ [query.sort]: query.order }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      });
      return {
        rows: rows.map(({ _count, totpFactor, ...row }) => ({
          ...row,
          mfaConfigured:
            Boolean(totpFactor?.confirmedAt) || _count.webauthnCredentials > 0,
        })),
        total,
        query,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function userDetail(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const id = recordId.parse(input);
  await serviceAccess(db, actor, { action: "read", resource: "users" });
  const row = await db.user.findUnique({ where: { id }, select: userSelect });
  if (!row) throw new ServiceError("NOT_FOUND", 404);
  const employees = await db.employee.findMany({
    where: { OR: [{ user: null }, { id: row.employeeId ?? "" }] },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { id: "asc" }],
  });
  return {
    ...row,
    mfaConfigured:
      Boolean(row.totpFactor?.confirmedAt) ||
      row._count.webauthnCredentials > 0,
    employees,
  };
}
export async function mutateUser(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const data = userMutationSchema.parse(input);
  return db.$transaction((tx) => mutateUserInTransaction(tx, actor, data), {
    timeout: 30_000,
  });
}
/** Reused by employee departures: same guards, same transaction and audit. */
export async function mutateUserInTransaction(
  tx: Prisma.TransactionClient,
  actor: Actor,
  input: unknown,
) {
  const data = userMutationSchema.parse(input);
  await lockStaff(tx);
  await lockUsers(tx, [actor.userId, data.userId]);
  const action =
    data.operation === "role"
      ? "users:change-role"
      : data.operation === "active"
        ? "users:set-active"
        : data.operation === "revoke-sessions"
          ? "users:revoke-sessions"
          : "update";
  await serviceAccess(tx, actor, { action, resource: "users" }, true);
  if (
    actor.userId === data.userId &&
    (data.operation === "role" ||
      data.operation === "revoke-sessions" ||
      (data.operation === "active" && !data.isActive))
  )
    throw new ServiceError("SELF_CHANGE_FORBIDDEN", 403);
  const target = await tx.user.findUnique({ where: { id: data.userId } });
  if (!target) throw new ServiceError("NOT_FOUND", 404);
  if (
    target.role === "ADMIN" &&
    target.isActive &&
    ((data.operation === "role" && data.role !== "ADMIN") ||
      (data.operation === "active" && !data.isActive))
  ) {
    if (
      (await tx.user.count({ where: { role: "ADMIN", isActive: true } })) <= 1
    )
      throw new ServiceError("LAST_ACTIVE_ADMIN", 409);
  }
  if (data.operation === "revoke-sessions") {
    const { count } = await tx.session.deleteMany({
      where: { userId: target.id },
    });
    await writeAudit(tx, {
      action: "USER_SESSIONS_REVOKED",
      userId: actor.userId,
      entityType: "User",
      entityId: target.id,
      changes: { count },
    });
    return;
  }
  let update: Prisma.UserUpdateInput;
  let before: Record<string, string | boolean | null>;
  let after: Record<string, string | boolean | null>;
  if (data.operation === "role") {
    update = { role: data.role };
    before = { role: target.role };
    after = { role: data.role };
  } else if (data.operation === "active") {
    update = { isActive: data.isActive };
    before = { isActive: target.isActive };
    after = { isActive: data.isActive };
    if (!data.isActive)
      await tx.session.deleteMany({ where: { userId: target.id } });
  } else {
    if (data.employeeId) {
      await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${data.employeeId} FOR UPDATE`;
      if (!(await tx.employee.findUnique({ where: { id: data.employeeId } })))
        throw new ServiceError("EMPLOYEE_NOT_FOUND");
      if (
        await tx.user.findFirst({
          where: { employeeId: data.employeeId, id: { not: target.id } },
        })
      )
        throw new ServiceError("EMPLOYEE_ALREADY_LINKED", 409);
    }
    update = {
      employee: data.employeeId
        ? { connect: { id: data.employeeId } }
        : { disconnect: true },
    };
    before = { employeeId: target.employeeId };
    after = { employeeId: data.employeeId };
  }
  await tx.user.update({ where: { id: target.id }, data: update });
  await writeAudit(tx, {
    action:
      data.operation === "role"
        ? "USER_ROLE_CHANGED"
        : data.operation === "active"
          ? "USER_STATUS_CHANGED"
          : "USER_EMPLOYEE_CHANGED",
    userId: actor.userId,
    entityType: "User",
    entityId: target.id,
    changes: { before, after },
  });
}
