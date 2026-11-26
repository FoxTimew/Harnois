import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type AuditDatabase = Pick<PrismaClient | Prisma.TransactionClient, "auditLog">;
export type AuditAction =
  | "LOGIN_SUCCEEDED"
  | "LOGIN_FAILED"
  | "INVITATION_CREATED"
  | "INVITATION_REVOKED"
  | "INVITATION_ACCEPTED"
  | "PROVIDER_LINKED"
  | "PROVIDER_UNLINKED"
  | "PASSWORD_RESET"
  | "PASSWORD_CHANGED"
  | "MFA_ENROLLMENT_STARTED"
  | "MFA_FACTOR_CONFIRMED"
  | "MFA_FACTOR_REMOVED"
  | "MFA_VERIFIED"
  | "MFA_VERIFICATION_FAILED"
  | "MFA_BLOCKED"
  | "MFA_RECOVERY_USED"
  | "MFA_RECOVERY_REGENERATED"
  | "MFA_RESET_ADMIN"
  | "MFA_RESET_CLI"
  | "MFA_NOTIFICATION_FAILED"
  | "PRIMARY_REVERIFIED";

/** A deliberately closed payload: never accept request bodies, emails or tokens. */
export function writeAudit(
  db: AuditDatabase,
  input: {
    action: AuditAction;
    userId?: string;
    entityType: "User" | "Invitation" | "Account" | "Authentication" | "Mfa";
    entityId?: string;
    providerId?: string;
    method?: "TOTP" | "WEBAUTHN" | "RECOVERY_CODE" | "PASSWORD";
    reason?: "INVALID_PROOF" | "COUNTER_REGRESSION" | "CHALLENGE_INVALID";
  },
) {
  return db.auditLog.create({
    data: {
      action: input.action,
      userId: input.userId,
      entityType: input.entityType,
      entityId: input.entityId ?? randomUUID(),
      changes: {
        ...(input.providerId ? { providerId: input.providerId } : {}),
        ...(input.method ? { method: input.method } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
      },
    },
  });
}
