import "server-only";
import { randomUUID } from "node:crypto";
import {
  Prisma,
  type PrismaClient,
  type Employee,
} from "@/generated/prisma/client";
import {
  employeeFieldsSchema,
  employeeMutationSchema,
  employeeQuerySchema,
  employeeStatusLabels,
  normalizeSearch,
  type EmployeeFields,
  type EmployeeQuery,
} from "@/lib/employee-validation";
import { dateOnly } from "@/lib/date-only";
import { recordId } from "@/lib/admin-validation";
import { csvRow } from "@/lib/csv";
import { lockStaff } from "@/server/locks";
import {
  serviceAccess,
  lockUsers,
  type Actor,
} from "@/server/auth/service-access";
import { assertPermission } from "@/server/auth/permissions";
import {
  validateEmployeeDates,
  validateEmployeeTransition,
  hierarchyProblems,
  employeeSearchText,
} from "./employee-invariants";
import { ServiceError } from "./errors";
import { writeAudit } from "./audit";
import { mutateUserInTransaction } from "./users";

export function employeeFields(row: Employee): EmployeeFields {
  return {
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    jobTitle: row.jobTitle,
    status: row.status,
    startDate: dateOnly(row.startDate),
    endDate: dateOnly(row.endDate),
    organizationId: row.organizationId,
    departmentId: row.departmentId,
    locationId: row.locationId,
    managerId: row.managerId,
  };
}
const publicSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  jobTitle: true,
  status: true,
  updatedAt: true,
  organizationId: true,
  departmentId: true,
  locationId: true,
  managerId: true,
  organization: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.EmployeeSelect;
const privateSelect = { phone: true, startDate: true, endDate: true } as const;
export function employeeScope(query: EmployeeQuery): Prisma.EmployeeWhereInput {
  const search = normalizeSearch(query.q).replace(/[\\%_]/g, "\\$&");
  return {
    ...(search ? { searchText: { contains: search } } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...Object.fromEntries(
      ["organizationId", "departmentId", "locationId", "managerId"].flatMap(
        (key) => {
          const value = query[key as keyof EmployeeQuery];
          return value ? [[key, value]] : [];
        },
      ),
    ),
  };
}
export async function listEmployees(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const query = employeeQuerySchema.parse(input);
  return db.$transaction(
    async (tx) => {
      const { user } = await serviceAccess(tx, actor, {
        action: "read",
        resource: "employees",
      });
      const privateFields = user.role === "ADMIN" || user.role === "IT_MANAGER";
      const where = employeeScope(query);
      const total = await tx.employee.count({ where });
      const rows = await tx.employee.findMany({
        where,
        select: { ...publicSelect, ...(privateFields ? privateSelect : {}) },
        orderBy: [{ [query.sort]: query.order }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      });
      return {
        rows: rows.map((row) => {
          const { phone, startDate, endDate, ...publicRow } = row;
          return {
            ...publicRow,
            updatedAt: row.updatedAt.toISOString(),
            ...(privateFields
              ? {
                  phone,
                  startDate: dateOnly(startDate),
                  endDate: dateOnly(endDate),
                }
              : {}),
          };
        }),
        total,
        query,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function employeeDetail(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const id = recordId.parse(input);
  const { user } = await serviceAccess(db, actor);
  assertPermission(user, "read", { type: "employees", ownerEmployeeId: id });
  const privateFields = user.role !== "TECHNICIAN";
  const row = await db.employee.findFirst({
    where: {
      id,
      ...(user.role === "EMPLOYEE" ? { id: user.employeeId ?? "" } : {}),
    },
    select: {
      ...publicSelect,
      ...(privateFields ? privateSelect : {}),
      ...(user.role === "ADMIN" || user.role === "IT_MANAGER"
        ? { user: { select: { isActive: true } } }
        : {}),
    },
  });
  if (!row) throw new ServiceError("NOT_FOUND", 404);
  // No security/connection fields cross this domain boundary.
  const { phone, startDate, endDate, ...publicRow } = row;
  return {
    ...publicRow,
    updatedAt: row.updatedAt.toISOString(),
    ...(privateFields
      ? { phone, startDate: dateOnly(startDate), endDate: dateOnly(endDate) }
      : {}),
  };
}
export async function employeeOptions(db: PrismaClient, actor: Actor) {
  await serviceAccess(db, actor, { action: "read", resource: "employees" });
  const [organizations, departments, locations, managers] = await Promise.all([
    db.organization.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.department.findMany({
      select: { id: true, name: true, organizationId: true },
      orderBy: { name: "asc" },
    }),
    db.location.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.employee.findMany({
      where: { status: { not: "LEFT" } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { id: "asc" }],
    }),
  ]);
  return { organizations, departments, locations, managers };
}
export type EmployeeChange = {
  id: string;
  before: Employee | null;
  fields: EmployeeFields;
};
/** Caller holds lockStaff. Lock all users before references/employees to preserve lock order. */
export async function lockEmployeeChanges(
  tx: Prisma.TransactionClient,
  actor: Actor,
  changes: EmployeeChange[],
) {
  const users = await tx.user.findMany({
    where: { employeeId: { in: changes.map((row) => row.id) } },
    select: { id: true },
  });
  await lockUsers(tx, [actor.userId, ...users.map((row) => row.id)]);
  for (const table of ["Organization", "Department", "Location"] as const) {
    const key =
      table === "Organization"
        ? "organizationId"
        : table === "Department"
          ? "departmentId"
          : "locationId";
    const ids = [
      ...new Set(
        changes.flatMap((row) => (row.fields[key] ? [row.fields[key]!] : [])),
      ),
    ].sort();
    if (ids.length)
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM ${Prisma.raw('"' + table + '"')} WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`,
      );
  }
  const ids = changes
    .filter((row) => row.before)
    .map((row) => row.id)
    .sort();
  if (ids.length)
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "Employee" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`,
    );
}
export async function validateEmployeeChanges(
  tx: Prisma.TransactionClient,
  actor: Actor,
  changes: EmployeeChange[],
  options: { immediateDepartureConfirmed: boolean; deactivateAccount: boolean },
) {
  const { user } = await serviceAccess(tx, actor, {
    action: "update",
    resource: "employees",
  });
  if (options.deactivateAccount)
    await serviceAccess(
      tx,
      actor,
      { action: "users:set-active", resource: "users" },
      true,
    );
  const organizations = await tx.organization.findMany({
    select: { id: true },
  });
  const departments = await tx.department.findMany({
    select: { id: true, organizationId: true },
  });
  const locations = await tx.location.findMany({ select: { id: true } });
  const graph = await tx.employee.findMany({
    select: { id: true, managerId: true, status: true },
  });
  const finalGraph = new Map(graph.map((row) => [row.id, row]));
  for (const row of changes)
    finalGraph.set(row.id, {
      id: row.id,
      managerId: row.fields.managerId,
      status: row.fields.status,
    });
  for (const row of changes) {
    const fields = employeeFieldsSchema.parse(row.fields);
    if (fields.departmentId) {
      const department = departments.find((d) => d.id === fields.departmentId);
      if (!department) throw new ServiceError("REFERENCE_NOT_FOUND");
      if (
        fields.organizationId &&
        fields.organizationId !== department.organizationId
      )
        throw new ServiceError("ORGANIZATION_MISMATCH");
      fields.organizationId = department.organizationId;
    }
    if (
      (fields.organizationId &&
        !organizations.some((o) => o.id === fields.organizationId)) ||
      (fields.locationId && !locations.some((l) => l.id === fields.locationId))
    )
      throw new ServiceError("REFERENCE_NOT_FOUND");
    validateEmployeeDates(fields);
    if (row.before) {
      validateEmployeeTransition(
        row.before.status,
        fields.status,
        user.role,
        options.immediateDepartureConfirmed,
      );
      if (row.before.status === "LEFT" && fields.status !== "LEFT")
        await serviceAccess(
          tx,
          actor,
          { action: "employees:restart", resource: "employees" },
          true,
        );
      if (
        row.before.status === "OFFBOARDING" &&
        fields.status === "ACTIVE" &&
        fields.endDate
      )
        throw new ServiceError("CANCEL_DEPARTURE_DATE");
    }
    if (fields.managerId && fields.managerId !== row.before?.managerId) {
      const manager = finalGraph.get(fields.managerId);
      if (!manager) throw new ServiceError("MANAGER_NOT_FOUND");
      if (manager.status === "LEFT") throw new ServiceError("MANAGER_LEFT");
    }
    row.fields = fields;
  }
  const problems = hierarchyProblems([...finalGraph.values()]);
  if (problems.size)
    throw new ServiceError(problems.values().next().value!, 409);
}
/** Validated changes only. New managers are inserted before linking any report. */
export async function persistEmployeeChanges(
  tx: Prisma.TransactionClient,
  actor: Actor,
  changes: EmployeeChange[],
  deactivateAccount: boolean,
) {
  for (const row of changes.filter((row) => !row.before)) {
    const fields = row.fields;
    await tx.employee.create({
      data: {
        id: row.id,
        ...fields,
        managerId: null,
        searchText: employeeSearchText(fields),
        startDate: fields.startDate ? new Date(fields.startDate) : null,
        endDate: fields.endDate ? new Date(fields.endDate) : null,
      },
    });
  }
  let created = 0,
    updated = 0,
    unchanged = 0;
  for (const row of changes) {
    if (deactivateAccount && row.fields.status === "LEFT") {
      const linked = await tx.user.findUnique({
        where: { employeeId: row.id },
        select: { id: true, isActive: true },
      });
      if (linked?.isActive)
        await mutateUserInTransaction(tx, actor, {
          operation: "active",
          userId: linked.id,
          isActive: false,
        });
    }
    const before = row.before ? employeeFields(row.before) : null;
    const changedFields = (
      Object.keys(row.fields) as (keyof EmployeeFields)[]
    ).filter((key) => !before || row.fields[key] !== before[key]);
    if (!changedFields.length) {
      unchanged++;
      continue;
    }
    await tx.employee.update({
      where: { id: row.id },
      data: {
        ...row.fields,
        searchText: employeeSearchText(row.fields),
        startDate: row.fields.startDate ? new Date(row.fields.startDate) : null,
        endDate: row.fields.endDate ? new Date(row.fields.endDate) : null,
      },
    });
    if (row.before) updated++;
    else created++;
    await writeAudit(tx, {
      action: row.before ? "EMPLOYEE_UPDATED" : "EMPLOYEE_CREATED",
      userId: actor.userId,
      entityType: "Employee",
      entityId: row.id,
      changes: { fields: changedFields },
    });
    if (before && before.status !== row.fields.status)
      await writeAudit(tx, {
        action:
          before.status === "ACTIVE" && row.fields.status === "LEFT"
            ? "EMPLOYEE_IMMEDIATE_DEPARTURE"
            : "EMPLOYEE_STATUS_CHANGED",
        userId: actor.userId,
        entityType: "Employee",
        entityId: row.id,
        changes: { before: before.status, after: row.fields.status },
      });
  }
  return { created, updated, unchanged };
}
export async function mutateEmployee(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const data = employeeMutationSchema.parse(input);
  try {
    return await db.$transaction(
      async (tx) => {
        await lockStaff(tx);
        await serviceAccess(tx, actor, {
          action: data.id ? "update" : "create",
          resource: "employees",
        });
        const before = data.id
          ? await tx.employee.findUnique({ where: { id: data.id } })
          : null;
        if (data.id && !before) throw new ServiceError("NOT_FOUND", 404);
        if (before && before.updatedAt.toISOString() !== data.updatedAt)
          throw new ServiceError("STALE_RECORD", 409);
        const change = {
          id: data.id ?? randomUUID(),
          before,
          fields: data.fields,
        };
        await lockEmployeeChanges(tx, actor, [change]);
        await validateEmployeeChanges(tx, actor, [change], data);
        if (data.deactivateAccount && data.fields.status !== "LEFT")
          throw new ServiceError("INVALID_REQUEST");
        await persistEmployeeChanges(
          tx,
          actor,
          [change],
          data.deactivateAccount,
        );
        return { id: change.id };
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
      throw new ServiceError("DUPLICATE_EMPLOYEE_EMAIL", 409);
    throw error;
  }
}
export const employeeExportColumns = [
  "email",
  "prenom",
  "nom",
  "poste",
  "statut",
  "date_arrivee",
  "date_depart",
  "organisation",
  "pole",
  "site",
  "manager_email",
] as const;
export async function exportEmployees(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const query = employeeQuerySchema.parse(input);
  return db.$transaction(
    async (tx) => {
      await lockUsers(tx, [actor.userId]);
      await serviceAccess(tx, actor, {
        action: "employees:export",
        resource: "employees",
      });
      const where = employeeScope(query);
      const count = await tx.employee.count({ where });
      if (count > 10_000) throw new ServiceError("EXPORT_TOO_LARGE", 422);
      let csv = "\uFEFF" + csvRow([...employeeExportColumns]);
      for (let skip = 0; skip < count; skip += 500) {
        const rows = await tx.employee.findMany({
          where,
          select: {
            ...publicSelect,
            startDate: true,
            endDate: true,
            manager: { select: { email: true } },
          },
          orderBy: [{ [query.sort]: query.order }, { id: "asc" }],
          skip,
          take: 500,
        });
        for (const row of rows)
          csv += csvRow([
            row.email,
            row.firstName,
            row.lastName,
            row.jobTitle ?? "",
            employeeStatusLabels[row.status],
            dateOnly(row.startDate) ?? "",
            dateOnly(row.endDate) ?? "",
            row.organization?.name ?? "",
            row.department?.name ?? "",
            row.location?.name ?? "",
            row.manager?.email ?? "",
          ]);
      }
      await writeAudit(tx, {
        action: "EMPLOYEES_EXPORTED",
        userId: actor.userId,
        entityType: "Employee",
        changes: {
          count,
          columns: employeeExportColumns,
          filters: { ...query, searchUsed: Boolean(query.q) },
        },
      });
      return csv;
    },
    { isolationLevel: "RepeatableRead", timeout: 30_000 },
  );
}
export async function departedActiveAccounts(db: PrismaClient, actor: Actor) {
  await serviceAccess(db, actor, { action: "read", resource: "users" });
  const where = { isActive: true, employee: { status: "LEFT" as const } };
  return {
    count: await db.user.count({ where }),
    rows: await db.user.findMany({
      where,
      select: {
        id: true,
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { id: "asc" },
      take: 50,
    }),
  };
}
export async function employeeAccountLinkOptions(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const employeeId = recordId.parse(input);
  await serviceAccess(db, actor, { action: "update", resource: "users" });
  const linked = await db.user.findUnique({
    where: { employeeId },
    select: { id: true, name: true },
  });
  const available = linked
    ? []
    : await db.user.findMany({
        where: { employeeId: null },
        select: { id: true, name: true, email: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      });
  return { linked, available };
}
