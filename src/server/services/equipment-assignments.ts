import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  assignmentSchema,
  returnSchema,
  loanDateSchema,
} from "@/lib/assignment-validation";
import { todayInParis } from "@/lib/date-only";
import { lockInventory } from "@/server/locks";
import {
  serviceAccess,
  lockUsers,
  type Actor,
} from "@/server/auth/service-access";
import { writeAudit } from "./audit";
import { ServiceError } from "./errors";
export async function assignEquipmentInTransaction(
  tx: Prisma.TransactionClient,
  actor: Actor,
  input: unknown,
) {
  const data = assignmentSchema.parse(input);
  await serviceAccess(tx, actor, { action: "create", resource: "assignments" });
  await tx.$queryRawUnsafe(
    'SELECT "id" FROM "Equipment" WHERE "id"=$1 FOR UPDATE',
    data.equipmentId,
  );
  const row = await tx.equipment.findUnique({
    where: { id: data.equipmentId },
  });
  if (!row) throw new ServiceError("NOT_FOUND", 404);
  if (
    await tx.equipmentAssignment.count({
      where: { equipmentId: row.id, returnedAt: null },
    })
  )
    throw new ServiceError("EQUIPMENT_ASSIGNED");
  if (row.status !== "IN_STOCK")
    throw new ServiceError("INVALID_STATUS_TRANSITION");
  if (row.condition === "DAMAGED" || data.conditionOut === "DAMAGED")
    throw new ServiceError("DAMAGED_EQUIPMENT");
  const employee = await tx.employee.findUnique({
    where: { id: data.employeeId },
    select: { status: true },
  });
  if (!employee || employee.status === "LEFT")
    throw new ServiceError("EMPLOYEE_UNAVAILABLE");
  if (
    data.kind === "LOAN" &&
    (!data.expectedReturnDate || data.expectedReturnDate < todayInParis())
  )
    throw new ServiceError("LOAN_DATE_REQUIRED");
  if (data.kind === "PERMANENT" && data.expectedReturnDate)
    throw new ServiceError("INVALID_REQUEST");
  const assignment = await tx.equipmentAssignment.create({
    data: {
      ...data,
      notes: data.notes || null,
      expectedReturnDate: data.expectedReturnDate
        ? new Date(data.expectedReturnDate)
        : null,
      assignedById: actor.userId,
    },
  });
  await tx.equipment.update({
    where: { id: row.id },
    data: {
      status: data.kind === "LOAN" ? "LOANED" : "ASSIGNED",
      condition: data.conditionOut,
    },
  });
  await writeAudit(tx, {
    action: "ASSIGNMENT_CREATED",
    userId: actor.userId,
    entityType: "Assignment",
    entityId: assignment.id,
    changes: {
      equipmentId: row.id,
      employeeId: data.employeeId,
      kind: data.kind,
    },
  });
  return { id: assignment.id };
}
export async function assignEquipment(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const data = assignmentSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      await lockInventory(tx);
      await lockUsers(tx, [actor.userId]);
      return assignEquipmentInTransaction(tx, actor, data);
    },
    { timeout: 20000 },
  );
}
export async function closeAssignment(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const data = returnSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      await lockInventory(tx);
      await lockUsers(tx, [actor.userId]);
      await serviceAccess(tx, actor, {
        action: "update",
        resource: "assignments",
      });
      const row = await tx.equipmentAssignment.findUnique({
        where: { id: data.assignmentId },
      });
      if (!row || row.returnedAt)
        throw new ServiceError("ASSIGNMENT_CLOSED", 409);
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "Equipment" WHERE "id"=$1 FOR UPDATE',
        row.equipmentId,
      );
      if (data.operation === "lost" && !data.notes)
        throw new ServiceError("REASON_REQUIRED");
      if (data.operation === "return" && !data.conditionIn)
        throw new ServiceError("RETURN_CONDITION_REQUIRED");
      await tx.equipmentAssignment.update({
        where: { id: row.id },
        data: {
          returnedAt: new Date(),
          closureReason: data.operation === "lost" ? "LOST" : "RETURNED",
          conditionIn: data.operation === "return" ? data.conditionIn : null,
          returnNotes: data.notes || null,
        },
      });
      await tx.equipment.update({
        where: { id: row.equipmentId },
        data: {
          status:
            data.operation === "lost"
              ? "LOST"
              : data.conditionIn === "DAMAGED"
                ? "IN_REPAIR"
                : "IN_STOCK",
          ...(data.operation === "return"
            ? { condition: data.conditionIn }
            : {}),
        },
      });
      await writeAudit(tx, {
        action:
          data.operation === "lost" ? "ASSIGNMENT_LOST" : "ASSIGNMENT_RETURNED",
        userId: actor.userId,
        entityType: "Assignment",
        entityId: row.id,
        changes: {
          equipmentId: row.equipmentId,
          employeeId: row.employeeId,
          ...(data.operation === "return"
            ? { condition: data.conditionIn }
            : {}),
        },
      });
      return { id: row.id };
    },
    { timeout: 20000 },
  );
}
export async function changeLoanDate(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const data = loanDateSchema.parse(input);
  return db.$transaction(async (tx) => {
    await lockInventory(tx);
    await lockUsers(tx, [actor.userId]);
    await serviceAccess(tx, actor, {
      action: "update",
      resource: "assignments",
    });
    const row = await tx.equipmentAssignment.findUnique({
      where: { id: data.assignmentId },
    });
    if (!row || row.returnedAt || row.kind !== "LOAN")
      throw new ServiceError("ASSIGNMENT_CLOSED", 409);
    if (data.expectedReturnDate < todayInParis())
      throw new ServiceError("LOAN_DATE_REQUIRED");
    await tx.equipmentAssignment.update({
      where: { id: row.id },
      data: { expectedReturnDate: new Date(data.expectedReturnDate) },
    });
    await writeAudit(tx, {
      action: "LOAN_DATE_CHANGED",
      userId: actor.userId,
      entityType: "Assignment",
      entityId: row.id,
      changes: { equipmentId: row.equipmentId, employeeId: row.employeeId },
    });
    return { id: row.id };
  });
}
