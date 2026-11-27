import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  demoEmployees,
  demoOrganizations,
  demoDepartments,
  demoLocations,
} from "../../../prisma/employee-demo-data";
import { employeeFieldsSchema } from "@/lib/employee-validation";
import { lockStaff } from "@/server/locks";
import {
  employeeSearchText,
  hierarchyProblems,
  validateEmployeeDates,
} from "./employee-invariants";
import { writeAudit } from "./audit";
import { ServiceError } from "./errors";
export function assertDemoSeedAllowed(value: unknown) {
  if (value !== "true") throw new ServiceError("DEMO_SEED_NOT_ALLOWED");
}
export async function seedDemoEmployees(db: PrismaClient, allowed: unknown) {
  assertDemoSeedAllowed(allowed);
  return db.$transaction(
    async (tx) => {
      await lockStaff(tx);
      const existing = await tx.employee.findMany({
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          managerId: true,
          status: true,
        },
      });
      const manifest = new Map(demoEmployees.map((row) => [row.id, row]));
      if (
        existing.some((row) => {
          const expected = manifest.get(row.id);
          return (
            !expected ||
            row.email !== expected.email ||
            row.firstName !== expected.firstName ||
            row.lastName !== expected.lastName
          );
        })
      )
        throw new ServiceError("DEMO_SEED_REAL_DATA");
      const finalGraph = demoEmployees.map(
        (row) => existing.find((old) => old.id === row.id) ?? row,
      );
      if (hierarchyProblems(finalGraph).size)
        throw new ServiceError("HIERARCHY_CYCLE");
      for (const row of demoEmployees) {
        const fields = Object.fromEntries(
          Object.entries(row).filter(([key]) => key !== "id"),
        );
        validateEmployeeDates(employeeFieldsSchema.parse(fields));
      }
      for (const row of demoOrganizations) {
        const old = await tx.organization.findUnique({ where: { id: row.id } });
        if (old && old.name !== row.name)
          throw new ServiceError("DEMO_SEED_MANIFEST_CHANGED");
        if (!old) {
          await tx.organization.create({ data: row });
          await writeAudit(tx, {
            action: "REFERENCE_CREATED",
            entityType: "Organization",
            entityId: row.id,
            changes: { fields: ["name"] },
          });
        }
      }
      for (const row of demoDepartments) {
        const old = await tx.department.findUnique({ where: { id: row.id } });
        if (
          old &&
          (old.name !== row.name || old.organizationId !== row.organizationId)
        )
          throw new ServiceError("DEMO_SEED_MANIFEST_CHANGED");
        if (!old) {
          await tx.department.create({ data: row });
          await writeAudit(tx, {
            action: "REFERENCE_CREATED",
            entityType: "Department",
            entityId: row.id,
            changes: { fields: ["name", "organizationId"] },
          });
        }
      }
      for (const row of demoLocations) {
        const old = await tx.location.findUnique({ where: { id: row.id } });
        if (old && (old.name !== row.name || old.city !== row.city))
          throw new ServiceError("DEMO_SEED_MANIFEST_CHANGED");
        if (!old) {
          await tx.location.create({ data: row });
          await writeAudit(tx, {
            action: "REFERENCE_CREATED",
            entityType: "Location",
            entityId: row.id,
            changes: { fields: ["name", "city"] },
          });
        }
      }
      const present = new Set(existing.map((row) => row.id));
      for (const row of demoEmployees) {
        if (present.has(row.id)) continue;
        await tx.employee.create({
          data: {
            ...row,
            managerId: null,
            searchText: employeeSearchText(row),
            startDate: row.startDate ? new Date(row.startDate) : null,
            endDate: row.endDate ? new Date(row.endDate) : null,
          },
        });
        await writeAudit(tx, {
          action: "EMPLOYEE_CREATED",
          entityType: "Employee",
          entityId: row.id,
          changes: {
            fields: [
              "firstName",
              "lastName",
              "email",
              "jobTitle",
              "status",
              "startDate",
              "endDate",
              "organizationId",
              "departmentId",
              "locationId",
              "managerId",
            ],
          },
        });
      }
      for (const row of demoEmployees)
        if (!present.has(row.id) && row.managerId)
          await tx.employee.update({
            where: { id: row.id },
            data: { managerId: row.managerId },
          });
      return {
        created: demoEmployees.length - present.size,
        existing: present.size,
      };
    },
    { timeout: 30_000 },
  );
}
