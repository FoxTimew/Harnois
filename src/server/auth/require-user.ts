import "server-only";
import type { PrismaClient, UserRole, User } from "@/generated/prisma/client";
import { getDb } from "@/server/db";
import { ServiceError } from "@/server/services/errors";

export type SessionReader = (headers: Headers) => Promise<{
  user: { id: string };
  session: { id: string; createdAt: Date; expiresAt: Date };
} | null>;

/** Authoritative check, also used by Better Auth's protected endpoints. No cross-request cache. */
export async function requireUser(options: {
  headers: Headers;
  roles?: UserRole[];
  fresh?: boolean;
  db?: PrismaClient;
  readSession?: SessionReader;
}): Promise<{
  user: User;
  session: { id: string; createdAt: Date; expiresAt: Date };
}> {
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
  const user = await db.user.findUnique({ where: { id: result.user.id } });
  if (!user?.isActive) throw new ServiceError("UNAUTHENTICATED", 401);
  if (options.roles && !options.roles.includes(user.role))
    throw new ServiceError("FORBIDDEN", 403);
  if (
    options.fresh &&
    Date.now() - result.session.createdAt.getTime() > 300_000
  )
    throw new ServiceError("REAUTHENTICATION_REQUIRED", 401);
  // Phase 02 adds the mandatory MFA gate here; these fields remain server-owned.
  return { user, session: result.session };
}
