import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  referenceKindSchema,
  referenceMutationSchema,
  type ReferenceKind,
} from "@/lib/reference-validation";
import {
  serviceAccess,
  lockUsers,
  type Actor,
} from "@/server/auth/service-access";
import { lockStaff } from "@/server/locks";
import { writeAudit } from "./audit";
import { ServiceError } from "./errors";

export type ReferenceRow = {
  id: string;
  name: string;
  updatedAt: string;
  organizationId: string | null;
  organizationName: string | null;
  address: string | null;
  city: string | null;
};
export async function listReferences(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
): Promise<ReferenceRow[]> {
  const kind = referenceKindSchema.parse(input);
  await serviceAccess(db, actor, { action: "read", resource: "organizations" });
  if (kind === "organizations")
    return (await db.organization.findMany({ orderBy: { name: "asc" } })).map(
      (row) => ({
        ...row,
        updatedAt: row.updatedAt.toISOString(),
        organizationId: null,
        organizationName: null,
        address: null,
        city: null,
      }),
    );
  if (kind === "departments")
    return (
      await db.department.findMany({
        include: { organization: { select: { name: true } } },
        orderBy: [{ organization: { name: "asc" } }, { name: "asc" }],
      })
    ).map((row) => ({
      id: row.id,
      name: row.name,
      updatedAt: row.updatedAt.toISOString(),
      organizationId: row.organizationId,
      organizationName: row.organization.name,
      address: null,
      city: null,
    }));
  return (await db.location.findMany({ orderBy: { name: "asc" } })).map(
    (row) => ({
      ...row,
      updatedAt: row.updatedAt.toISOString(),
      organizationId: null,
      organizationName: null,
    }),
  );
}
async function lockReference(
  tx: Prisma.TransactionClient,
  kind: ReferenceKind,
  id: string,
) {
  if (kind === "organizations")
    await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${id} FOR UPDATE`;
  else if (kind === "departments")
    await tx.$queryRaw`SELECT "id" FROM "Department" WHERE "id" = ${id} FOR UPDATE`;
  else
    await tx.$queryRaw`SELECT "id" FROM "Location" WHERE "id" = ${id} FOR UPDATE`;
}
export async function referenceCounts(
  tx: Prisma.TransactionClient,
  kind: ReferenceKind,
  id: string,
): Promise<Record<string, number>> {
  if (kind === "organizations")
    return {
      departments: await tx.department.count({ where: { organizationId: id } }),
      employees: await tx.employee.count({ where: { organizationId: id } }),
      subscriptions: await tx.subscription.count({
        where: { organizationId: id },
      }),
    };
  if (kind === "departments")
    return {
      employees: await tx.employee.count({ where: { departmentId: id } }),
    };
  return {
    employees: await tx.employee.count({ where: { locationId: id } }),
    equipment: await tx.equipment.count({ where: { locationId: id } }),
  };
}
export async function mutateReference(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const data = referenceMutationSchema.parse(input);
  try {
    return await db.$transaction(
      async (tx) => {
        await lockStaff(tx);
        await lockUsers(tx, [actor.userId]);
        await serviceAccess(tx, actor, {
          action:
            data.operation === "delete"
              ? "archive"
              : data.id
                ? "update"
                : "create",
          resource: "organizations",
        });
        if (data.kind === "departments" && data.fields?.organizationId) {
          await lockReference(tx, "organizations", data.fields.organizationId);
          if (
            !(await tx.organization.findUnique({
              where: { id: data.fields.organizationId },
            }))
          )
            throw new ServiceError("REFERENCE_NOT_FOUND");
        }
        if (data.id) await lockReference(tx, data.kind, data.id);
        const before = data.id
          ? data.kind === "organizations"
            ? await tx.organization.findUnique({ where: { id: data.id } })
            : data.kind === "departments"
              ? await tx.department.findUnique({ where: { id: data.id } })
              : await tx.location.findUnique({ where: { id: data.id } })
          : null;
        if (data.id && !before) throw new ServiceError("NOT_FOUND", 404);
        if (before && before.updatedAt.toISOString() !== data.updatedAt)
          throw new ServiceError("STALE_RECORD", 409);
        if (data.operation === "delete") {
          const counts = await referenceCounts(tx, data.kind, data.id!);
          if (Object.values(counts).some((count) => count > 0))
            throw new ServiceError("REFERENCE_IN_USE", 409, counts);
          if (data.kind === "organizations")
            await tx.organization.delete({ where: { id: data.id } });
          else if (data.kind === "departments")
            await tx.department.delete({ where: { id: data.id } });
          else await tx.location.delete({ where: { id: data.id } });
        } else {
          const fields = data.fields!;
          if (
            before &&
            "organizationId" in before &&
            before.organizationId !== fields.organizationId
          ) {
            const counts = await referenceCounts(tx, "departments", before.id);
            if (counts.employees)
              throw new ServiceError("DEPARTMENT_HAS_EMPLOYEES", 409, counts);
          }
          const saved =
            data.kind === "organizations"
              ? data.id
                ? await tx.organization.update({
                    where: { id: data.id },
                    data: { name: fields.name },
                  })
                : await tx.organization.create({ data: { name: fields.name } })
              : data.kind === "departments"
                ? data.id
                  ? await tx.department.update({
                      where: { id: data.id },
                      data: {
                        name: fields.name,
                        organizationId: fields.organizationId!,
                      },
                    })
                  : await tx.department.create({
                      data: {
                        name: fields.name,
                        organizationId: fields.organizationId!,
                      },
                    })
                : data.id
                  ? await tx.location.update({
                      where: { id: data.id },
                      data: {
                        name: fields.name,
                        address: fields.address,
                        city: fields.city,
                      },
                    })
                  : await tx.location.create({
                      data: {
                        name: fields.name,
                        address: fields.address,
                        city: fields.city,
                      },
                    });
          data.id = saved.id;
        }
        await writeAudit(tx, {
          action:
            data.operation === "delete"
              ? "REFERENCE_DELETED"
              : before
                ? "REFERENCE_UPDATED"
                : "REFERENCE_CREATED",
          userId: actor.userId,
          entityType:
            data.kind === "organizations"
              ? "Organization"
              : data.kind === "departments"
                ? "Department"
                : "Location",
          entityId: data.id,
          changes: {
            fields:
              data.operation === "delete"
                ? []
                : data.kind === "organizations"
                  ? ["name"]
                  : data.kind === "departments"
                    ? ["name", "organizationId"]
                    : ["name", "address", "city"],
          },
        });
        return { id: data.id! };
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    )
      throw new ServiceError("DUPLICATE_REFERENCE", 409);
    throw error;
  }
}
