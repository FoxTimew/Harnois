import { z } from "zod";

export const recordId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const roleSchema = z.enum([
  "ADMIN",
  "IT_MANAGER",
  "TECHNICIAN",
  "EMPLOYEE",
]);
export const userMutationSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("role"),
      userId: recordId,
      role: roleSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("active"),
      userId: recordId,
      isActive: z.boolean(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("employee"),
      userId: recordId,
      employeeId: recordId.nullable(),
    })
    .strict(),
  z
    .object({ operation: z.literal("revoke-sessions"), userId: recordId })
    .strict(),
]);
export const sessionMutationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("one"), sessionId: recordId }).strict(),
  z.object({ operation: z.literal("others") }).strict(),
]);
export type UserMutation = z.infer<typeof userMutationSchema>;
