import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { recordId } from "@/lib/admin-validation";
import { dateOnly } from "@/lib/date-only";
import { labelOptionsSchema } from "@/lib/equipment-qr";
import {
  renderCertificate,
  renderLabels,
  type CertificateData,
} from "@/server/pdf/equipment";
import { getServerEnv } from "@/server/env";
import { serviceAccess, type Actor } from "@/server/auth/service-access";
import { writeAudit } from "./audit";
import { ServiceError } from "./errors";

export const certificateSchema = z
  .object({
    assignmentIds: z
      .array(recordId)
      .min(1)
      .max(100)
      .refine((v) => new Set(v).size === v.length),
    kind: z.enum(["handover", "return"]),
  })
  .strict();
export async function equipmentCertificate(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const data = certificateSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      await serviceAccess(tx, actor, {
        action: "equipment:documents",
        resource: "equipment",
      });
      const assignments = await tx.equipmentAssignment.findMany({
        where: { id: { in: data.assignmentIds } },
        include: {
          equipment: true,
          employee: { include: { organization: true } },
        },
        orderBy: { assignedAt: "asc" },
      });
      if (assignments.length !== data.assignmentIds.length)
        throw new ServiceError("NOT_FOUND", 404);
      const employee = assignments[0].employee;
      if (!employee.organization)
        throw new ServiceError("ORGANIZATION_REQUIRED");
      if (assignments.some((a) => a.employeeId !== employee.id))
        throw new ServiceError("ONE_EMPLOYEE_REQUIRED");
      if (
        data.kind === "return" &&
        assignments.some((a) => !a.returnedAt || a.closureReason !== "RETURNED")
      )
        throw new ServiceError("RETURN_REQUIRED");
      const model: CertificateData = {
        kind: data.kind,
        generatedAt: new Date().toISOString(),
        organization: employee.organization.name,
        employee: employee.firstName + " " + employee.lastName,
        rows: assignments.map((a) => ({
          assetTag: a.equipment.assetTag,
          name: a.equipment.name,
          serialNumber: a.equipment.serialNumber,
          assignedAt: a.assignedAt.toISOString(),
          returnedAt: a.returnedAt?.toISOString() ?? null,
          conditionOut: a.conditionOut,
          conditionIn: a.conditionIn,
          expectedReturnDate: dateOnly(a.expectedReturnDate),
          notes: data.kind === "return" ? a.returnNotes : a.notes,
        })),
      };
      const pdf = await renderCertificate(model);
      await writeAudit(tx, {
        action: "EQUIPMENT_DOCUMENT_GENERATED",
        userId: actor.userId,
        entityType: "Employee",
        entityId: employee.id,
        changes: {
          kind: data.kind,
          count: assignments.length,
          employeeId: employee.id,
        },
      });
      return pdf;
    },
    { isolationLevel: "RepeatableRead", timeout: 30000 },
  );
}
export async function equipmentLabels(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const options = labelOptionsSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      await serviceAccess(tx, actor, {
        action: "equipment:labels",
        resource: "equipment",
      });
      const rows = await tx.equipment.findMany({
        where: { id: { in: options.ids } },
        select: { id: true, assetTag: true, name: true },
      });
      if (rows.length !== options.ids.length)
        throw new ServiceError("NOT_FOUND", 404);
      const ordered = options.ids.map((id) => rows.find((r) => r.id === id)!);
      const pdf = await renderLabels(
        ordered,
        getServerEnv().BETTER_AUTH_URL,
        options,
      );
      await writeAudit(tx, {
        action: "EQUIPMENT_LABELS_GENERATED",
        userId: actor.userId,
        entityType: "Equipment",
        changes: { count: rows.length },
      });
      return pdf;
    },
    { isolationLevel: "RepeatableRead", timeout: 30000 },
  );
}
