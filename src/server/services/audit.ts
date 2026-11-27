import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { auditQuerySchema, type AuditQuery } from "@/lib/table-query";
import { recordId, roleSchema } from "@/lib/admin-validation";
import { parisDayBoundary, formatDate } from "@/lib/format";
import { csvRow } from "@/lib/csv";
import {
  serviceAccess,
  lockUsers,
  type Actor,
} from "@/server/auth/service-access";
import { ServiceError } from "./errors";

const securityActions = [
  "LOGIN_SUCCEEDED",
  "LOGIN_FAILED",
  "INVITATION_CREATED",
  "INVITATION_REVOKED",
  "INVITATION_ACCEPTED",
  "PROVIDER_LINKED",
  "PROVIDER_UNLINKED",
  "PASSWORD_RESET",
  "PASSWORD_CHANGED",
  "MFA_ENROLLMENT_STARTED",
  "MFA_FACTOR_CONFIRMED",
  "MFA_FACTOR_REMOVED",
  "MFA_VERIFIED",
  "MFA_VERIFICATION_FAILED",
  "MFA_BLOCKED",
  "MFA_RECOVERY_USED",
  "MFA_RECOVERY_REGENERATED",
  "MFA_RESET_ADMIN",
  "MFA_RESET_CLI",
  "MFA_NOTIFICATION_FAILED",
  "PRIMARY_REVERIFIED",
  "USER_ROLE_CHANGED",
  "USER_STATUS_CHANGED",
  "USER_EMPLOYEE_CHANGED",
  "USER_SESSIONS_REVOKED",
  "SESSIONS_REVOKED",
  "AUDIT_EXPORTED",
] as const;
// Future domain services must register their actions explicitly. Unknown events are ADMIN-only.
const businessActions = [
  "EQUIPMENT_CREATED",
  "EQUIPMENT_UPDATED",
  "EQUIPMENT_ARCHIVED",
  "ASSIGNMENT_CREATED",
  "ASSIGNMENT_RETURNED",
] as const;
export type AuditAction =
  (typeof securityActions)[number] | (typeof businessActions)[number];
export const auditRegistry = Object.fromEntries([
  ...securityActions.map((action) => [action, "security"]),
  ...businessActions.map((action) => [action, "business"]),
]) as Record<AuditAction, "security" | "business">;
export const sensitiveAuditFields = [
  "password",
  "passwordHash",
  "secret",
  "encryptedSecret",
  "totpSecret",
  "token",
  "tokenHash",
  "accessToken",
  "refreshToken",
  "idToken",
  "sessionToken",
  "licenseKey",
  "encryptionKey",
  "privateKey",
  "publicKey",
  "credentialId",
  "challenge",
  "recoveryCodes",
  "backupCodes",
  "codeHash",
  "hash",
  "cookie",
  "authorization",
  "email",
  "name",
  "firstName",
  "lastName",
  "ipAddress",
  "userAgent",
  "body",
  "recipient",
] as const;
const normalizedKey = (key: string) =>
  key.toLowerCase().replace(/[^a-z0-9]/g, "");
const excluded = new Set<string>(sensitiveAuditFields.map(normalizedKey));
/** Defense in depth for legacy nested objects, arrays and aliases. */
export function sanitizeAudit(
  value: unknown,
  depth = 0,
): Prisma.InputJsonValue | null {
  if (depth > 12) return null;
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value))
    return value.map((item) => sanitizeAudit(item, depth + 1));
  if (typeof value !== "object") return null;
  const result: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [key, item] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    if (
      ["__proto__", "constructor", "prototype"].includes(key) ||
      excluded.has(normalized) ||
      /password|secret|token|hash|licensekey|privatekey|recoverycode|backupcode|challenge/.test(
        normalized,
      )
    )
      continue;
    result[key] = sanitizeAudit(item, depth + 1);
  }
  return result;
}
const beforeAfter = (schema: z.ZodType) =>
  z.object({ before: schema, after: schema });
const payloadSchemas: Partial<Record<AuditAction, z.ZodType>> = {
  USER_ROLE_CHANGED: beforeAfter(z.object({ role: roleSchema })),
  USER_STATUS_CHANGED: beforeAfter(z.object({ isActive: z.boolean() })),
  USER_EMPLOYEE_CHANGED: beforeAfter(
    z.object({ employeeId: recordId.nullable() }),
  ),
  USER_SESSIONS_REVOKED: z.object({ count: z.number().int().nonnegative() }),
  SESSIONS_REVOKED: z.object({
    count: z.number().int().nonnegative(),
    scope: z.enum(["one", "others"]),
  }),
  AUDIT_EXPORTED: z.object({
    count: z.number().int().min(0).max(10_000),
    filters: auditQuerySchema.pick({
      from: true,
      to: true,
      userId: true,
      entityId: true,
      entityType: true,
      action: true,
      sort: true,
      order: true,
    }),
  }),
};
type AuditDatabase = Pick<PrismaClient | Prisma.TransactionClient, "auditLog">;
/** Closed action-specific payloads: never accept request bodies or model snapshots. */
export function writeAudit(
  db: AuditDatabase,
  input: {
    action: AuditAction;
    userId?: string;
    entityType:
      | "User"
      | "Invitation"
      | "Account"
      | "Authentication"
      | "Mfa"
      | "AuditLog"
      | "Equipment"
      | "Assignment";
    entityId?: string;
    providerId?: string;
    method?: "TOTP" | "WEBAUTHN" | "RECOVERY_CODE" | "PASSWORD";
    reason?: "INVALID_PROOF" | "COUNTER_REGRESSION" | "CHALLENGE_INVALID";
    changes?: unknown;
  },
) {
  const payload = payloadSchemas[input.action]?.parse(input.changes) ?? {
    ...(input.providerId
      ? {
          providerId: z
            .enum(["google", "microsoft", "credential"])
            .parse(input.providerId),
        }
      : {}),
    ...(input.method ? { method: input.method } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
  };
  return db.auditLog.create({
    data: {
      action: input.action,
      userId: input.userId,
      entityType: input.entityType,
      entityId: input.entityId ?? randomUUID(),
      changes: sanitizeAudit(payload) ?? {},
    },
  });
}
function scope(query: AuditQuery, admin: boolean): Prisma.AuditLogWhereInput {
  return {
    AND: [
      ...(admin ? [] : [{ action: { in: [...businessActions] } }]),
      ...(query.action ? [{ action: query.action }] : []),
      ...(query.entityType ? [{ entityType: query.entityType }] : []),
      ...(query.entityId ? [{ entityId: query.entityId }] : []),
      ...(query.userId ? [{ userId: query.userId }] : []),
      {
        createdAt: {
          ...(query.from ? { gte: parisDayBoundary(query.from) } : {}),
          ...(query.to ? { lt: parisDayBoundary(query.to, true) } : {}),
        },
      },
    ],
  };
}
const auditSelect = {
  id: true,
  userId: true,
  action: true,
  entityType: true,
  entityId: true,
  changes: true,
  createdAt: true,
  user: { select: { name: true } },
} satisfies Prisma.AuditLogSelect;
const clean = <T extends { changes: unknown }>(row: T) => ({
  ...row,
  changes: sanitizeAudit(row.changes),
});
export async function listAudit(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const query = auditQuerySchema.parse(input);
  return db.$transaction(
    async (tx) => {
      const { user } = await serviceAccess(tx, actor, {
        action: "read",
        resource: { type: "audit", category: "business" },
      });
      const where = scope(query, user.role === "ADMIN");
      const total = await tx.auditLog.count({ where });
      const rows = await tx.auditLog.findMany({
        where,
        select: auditSelect,
        orderBy: [{ [query.sort]: query.order }, { id: "asc" }],
        take: query.pageSize,
        skip: (query.page - 1) * query.pageSize,
      });
      return { rows: rows.map(clean), total, query };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function auditDetail(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const id = recordId.parse(input);
  const { user } = await serviceAccess(db, actor, {
    action: "read",
    resource: { type: "audit", category: "business" },
  });
  const row = await db.auditLog.findFirst({
    where: {
      id,
      ...(user.role === "ADMIN"
        ? {}
        : { action: { in: [...businessActions] } }),
    },
    select: auditSelect,
  });
  if (!row) throw new ServiceError("NOT_FOUND", 404);
  return clean(row);
}
export async function exportAudit(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const query = auditQuerySchema.parse(input);
  return db.$transaction(
    async (tx) => {
      await lockUsers(tx, [actor.userId]);
      const { user } = await serviceAccess(tx, actor, {
        action: "audit:export",
        resource: { type: "audit", category: "business" },
      });
      const where = scope(query, user.role === "ADMIN");
      const count = await tx.auditLog.count({ where });
      if (count > 10_000) throw new ServiceError("EXPORT_TOO_LARGE", 422);
      let csv =
        "\uFEFF" +
        csvRow([
          "Date (Europe/Paris)",
          "Auteur",
          "Action",
          "Type",
          "Identifiant",
          "Changements",
        ]);
      for (let skip = 0; skip < count; skip += 500) {
        const rows = await tx.auditLog.findMany({
          where,
          select: auditSelect,
          orderBy: [{ [query.sort]: query.order }, { id: "asc" }],
          skip,
          take: 500,
        });
        for (const row of rows)
          csv += csvRow([
            formatDate(row.createdAt),
            row.user?.name ?? "Système",
            row.action,
            row.entityType,
            row.entityId,
            JSON.stringify(sanitizeAudit(row.changes)),
          ]);
      }
      await writeAudit(tx, {
        action: "AUDIT_EXPORTED",
        userId: actor.userId,
        entityType: "AuditLog",
        changes: { count, filters: query },
      });
      return csv;
    },
    { isolationLevel: "RepeatableRead", timeout: 30_000 },
  );
}
