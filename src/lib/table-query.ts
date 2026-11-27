import { z } from "zod";
import { recordId, roleSchema } from "./admin-validation";

export type SearchParams = Record<string, string | string[] | undefined>;
const boundedPage = z.coerce.number().int().min(1).max(1_000_000).catch(1);
export const tableQuerySchema = z.object({
  q: z.string().trim().max(100).catch(""),
  page: boundedPage,
  pageSize: z.coerce
    .number()
    .pipe(
      z.union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)]),
    )
    .catch(25),
  order: z.enum(["asc", "desc"]).catch("asc"),
  columns: z.string().max(300).catch(""),
});
export const userQuerySchema = tableQuerySchema.extend({
  sort: z
    .enum(["name", "email", "role", "isActive", "lastLoginAt"])
    .catch("name"),
  role: roleSchema.optional().catch(undefined),
  active: z.enum(["true", "false"]).optional().catch(undefined),
});
export const auditQuerySchema = tableQuerySchema.omit({ q: true }).extend({
  sort: z.enum(["createdAt", "action", "entityType"]).catch("createdAt"),
  order: z.enum(["asc", "desc"]).catch("desc"),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  userId: recordId.optional().catch(undefined),
  entityId: recordId.optional().catch(undefined),
  entityType: z
    .string()
    .regex(/^[A-Za-z]{1,40}$/)
    .optional()
    .catch(undefined),
  action: z
    .string()
    .regex(/^[A-Z_]{1,80}$/)
    .optional()
    .catch(undefined),
});
export type TableQuery = z.infer<typeof tableQuerySchema>;
export type UserQuery = z.infer<typeof userQuerySchema>;
export type AuditQuery = z.infer<typeof auditQuerySchema>;
export function queryString(
  query: Record<string, unknown>,
  changes: Record<string, unknown> = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, ...changes }))
    if (value !== undefined && value !== null && value !== "")
      params.set(key, String(value));
  return params.toString();
}
