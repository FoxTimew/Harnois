import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { sessionMutationSchema, recordId } from "@/lib/admin-validation";
import { describeDevice } from "@/lib/user-agent";
import {
  lockUsers,
  serviceAccess,
  type Actor,
} from "@/server/auth/service-access";
import { writeAudit } from "./audit";
import { ServiceError } from "./errors";

export async function listSessions(
  db: PrismaClient,
  actor: Actor,
  ownerId = actor.userId,
) {
  const id = recordId.parse(ownerId);
  await serviceAccess(db, actor, {
    action: "read",
    resource: { type: "sessions", ownerUserId: id },
  });
  const sessions = await db.session.findMany({
    where: { userId: id, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      lastSeenAt: true,
      createdAt: true,
    },
    orderBy: [{ lastSeenAt: "desc" }, { id: "asc" }],
  });
  return sessions.map(({ userAgent, ...session }) => ({
    ...session,
    device: describeDevice(userAgent),
    current: session.id === actor.sessionId,
  }));
}
export async function revokeSessions(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const data = sessionMutationSchema.parse(input);
  return db.$transaction(async (tx) => {
    await lockUsers(tx, [actor.userId]);
    await serviceAccess(
      tx,
      actor,
      {
        action: "sessions:revoke",
        resource: { type: "sessions", ownerUserId: actor.userId },
      },
      true,
    );
    const where = {
      userId: actor.userId,
      ...(data.operation === "one"
        ? { id: data.sessionId }
        : { id: { not: actor.sessionId } }),
    };
    const removed = await tx.session.deleteMany({ where });
    if (data.operation === "one" && !removed.count)
      throw new ServiceError("NOT_FOUND", 404);
    await writeAudit(tx, {
      action: "SESSIONS_REVOKED",
      userId: actor.userId,
      entityType: "User",
      entityId: actor.userId,
      changes: { count: removed.count, scope: data.operation },
    });
    return {
      currentRevoked:
        data.operation === "one" && data.sessionId === actor.sessionId,
    };
  });
}
