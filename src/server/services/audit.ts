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
  | "PASSWORD_RESET";

/** A deliberately closed payload: never accept request bodies, emails or tokens. */
export function writeAudit(
  db: AuditDatabase,
  input: {
    action: AuditAction;
    userId?: string;
    entityType: "User" | "Invitation" | "Account" | "Authentication";
    entityId?: string;
    providerId?: string;
  },
) {
  return db.auditLog.create({
    data: {
      action: input.action,
      userId: input.userId,
      entityType: input.entityType,
      entityId: input.entityId ?? randomUUID(),
      ...(input.providerId
        ? { changes: { providerId: input.providerId } }
        : {}),
    },
  });
}
