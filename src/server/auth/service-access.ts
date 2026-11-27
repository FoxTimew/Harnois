import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import {
  assertMfaAccess,
  loadMfaContext,
  type MfaDatabase,
} from "./mfa-policy";
import { assertPermission, type Permission } from "./permissions";

export type Actor = { userId: string; sessionId: string };
export async function lockUsers(tx: Prisma.TransactionClient, ids: string[]) {
  for (const id of [...new Set(ids)].sort())
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
}
export async function serviceAccess(
  db: MfaDatabase,
  actor: Actor,
  permission?: Permission,
  fresh = false,
) {
  const context = await loadMfaContext(db, actor.userId, actor.sessionId);
  assertMfaAccess(context, { fresh });
  if (permission)
    assertPermission(context.user, permission.action, permission.resource);
  return context;
}
