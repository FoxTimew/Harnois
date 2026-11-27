import { z } from "zod";
import { recordId } from "./admin-validation";
import { dateOnlySchema } from "./date-only";
import { equipmentConditions } from "./equipment-validation";
export const assignmentSchema = z
  .object({
    equipmentId: recordId,
    employeeId: recordId,
    kind: z.enum(["PERMANENT", "LOAN"]),
    expectedReturnDate: dateOnlySchema.nullable().default(null),
    conditionOut: z.enum(equipmentConditions),
    notes: z.string().trim().max(2000).default(""),
  })
  .strict();
export const returnSchema = z
  .object({
    assignmentId: recordId,
    operation: z.enum(["return", "lost"]),
    conditionIn: z.enum(equipmentConditions).optional(),
    notes: z.string().trim().max(2000).default(""),
  })
  .strict();
export const loanDateSchema = z
  .object({ assignmentId: recordId, expectedReturnDate: dateOnlySchema })
  .strict();
