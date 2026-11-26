import "server-only";
import { createHash } from "node:crypto";
import type { Prisma, PrismaClient, UserRole } from "@/generated/prisma/client";
import { ServiceError } from "@/server/services/errors";

export type MfaDatabase = PrismaClient | Prisma.TransactionClient;
export type MfaState = "setup" | "verify" | "ready";
export type MfaAccess = {
  states?: readonly MfaState[];
  fresh?: boolean;
  roles?: UserRole[];
};
export const recentWindow = 10 * 60_000;
export function isRecent(date: Date | null, now = new Date()) {
  const age = date ? now.getTime() - date.getTime() : Infinity;
  return age >= 0 && age < recentWindow;
}
export function mfaNamespace(userId: string) {
  return `mfa:${createHash("sha256").update(userId).digest("hex")}:`;
}
export function primaryIdentifier(userId: string, sessionId: string) {
  return `${mfaNamespace(userId)}primary:${sessionId}`;
}
export function isMfaMandatory(user: { role: UserRole; mfaEnforced: boolean }) {
  return user.mfaEnforced || user.role !== "EMPLOYEE";
}
/** Reread the session as well as the user: a reset must invalidate a previously read cookie. */
export async function loadMfaContext(
  db: MfaDatabase,
  userId: string,
  sessionId: string,
  now = new Date(),
) {
  const user = await db.user.findUnique({ where: { id: userId } });
  const session = await db.session.findUnique({ where: { id: sessionId } });
  if (
    !user?.isActive ||
    !session ||
    session.userId !== user.id ||
    session.expiresAt <= now
  )
    throw new ServiceError("UNAUTHENTICATED", 401);
  const totp = await db.totpFactor.count({
    where: { userId, confirmedAt: { not: null } },
  });
  const keys = await db.webAuthnCredential.count({ where: { userId } });
  const hasFactor = totp + keys > 0;
  const mandatory = isMfaMandatory(user);
  const state: MfaState =
    !hasFactor && mandatory
      ? "setup"
      : hasFactor && (!session.mfaVerifiedAt || session.mfaVerifiedAt > now)
        ? "verify"
        : "ready";
  let recent = hasFactor
    ? isRecent(session.mfaVerifiedAt, now)
    : isRecent(session.createdAt, now);
  if (!hasFactor && !recent) {
    const proof = await db.verification.findFirst({
      where: {
        identifier: primaryIdentifier(userId, sessionId),
        expiresAt: { gt: now },
        createdAt: { lte: now },
      },
    });
    recent = Boolean(proof);
  }
  return {
    user,
    session,
    mfa: {
      state,
      mandatory,
      hasFactor,
      recent,
      hasTotp: totp > 0,
      hasKeys: keys > 0,
    },
  };
}
export type MfaContext = Awaited<ReturnType<typeof loadMfaContext>>;
export function assertMfaAccess(context: MfaContext, access: MfaAccess = {}) {
  if (!(access.states ?? ["ready"]).includes(context.mfa.state))
    throw new ServiceError(
      context.mfa.state === "setup" ? "MFA_SETUP_REQUIRED" : "MFA_REQUIRED",
      403,
    );
  if (access.roles && !access.roles.includes(context.user.role))
    throw new ServiceError("FORBIDDEN", 403);
  if (access.fresh && !context.mfa.recent)
    throw new ServiceError("REAUTHENTICATION_REQUIRED", 403);
}
