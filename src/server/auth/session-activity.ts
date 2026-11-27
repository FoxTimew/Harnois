import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";

/** Conditional UPDATE serializes concurrent touches; never renews or recreates a session. */
export async function touchSession(
  db: PrismaClient,
  id: string,
  now = new Date(),
) {
  return db.session.updateMany({
    where: {
      id,
      expiresAt: { gt: now },
      user: { isActive: true },
      OR: [
        { lastSeenAt: null },
        { lastSeenAt: { lte: new Date(+now - 60_000) } },
      ],
    },
    data: { lastSeenAt: now },
  });
}
