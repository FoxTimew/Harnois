import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/server/db";
import { ServiceError } from "@/server/services/errors";
import { assertMfaAccess, loadMfaContext, type MfaAccess } from "./mfa-policy";
import { assertPermission, type Permission } from "./permissions";
import { touchSession } from "./session-activity";

export type SessionReader = (headers: Headers) => Promise<{
  user: { id: string };
  session: { id: string; createdAt: Date; expiresAt: Date };
} | null>;

/** Authoritative check, also used by Better Auth's protected endpoints. No cross-request cache. */
export async function requireUser(
  options: MfaAccess & {
    headers: Headers;
    db?: PrismaClient;
    readSession?: SessionReader;
    permission?: Permission;
  },
) {
  const db = options.db ?? getDb();
  const readSession: SessionReader =
    options.readSession ??
    (async (headers: Headers) => {
      const { getAuth } = await import("./config");
      return getAuth().api.getSession({
        headers,
        query: { disableCookieCache: true, disableRefresh: true },
      });
    });
  const result = await readSession(options.headers);
  if (!result || result.session.expiresAt <= new Date())
    throw new ServiceError("UNAUTHENTICATED", 401);
  const context = await loadMfaContext(db, result.user.id, result.session.id);
  assertMfaAccess(context, options);
  if (options.permission)
    assertPermission(
      context.user,
      options.permission.action,
      options.permission.resource,
    );
  await touchSession(db, context.session.id);
  return context;
}
