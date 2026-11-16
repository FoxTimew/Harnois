import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { ServiceError } from "./errors";
import { writeAudit } from "./audit";

export async function unlinkAccount(
  db: PrismaClient,
  userId: string,
  input: unknown,
) {
  const { accountId } = z.object({ accountId: z.string().min(1) }).parse(input);
  return db.$transaction(async (tx) => {
    // The native count-then-delete guard alone cannot protect concurrent unlink requests.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user?.isActive) throw new ServiceError("UNAUTHENTICATED", 401);
    const accounts = await tx.account.findMany({ where: { userId } });
    const account = accounts.find((item) => item.id === accountId);
    if (!account) throw new ServiceError("ACCOUNT_NOT_FOUND", 404);
    if (
      !accounts.some(
        (item) =>
          item.id !== accountId &&
          (item.providerId !== "credential" || item.password),
      )
    )
      throw new ServiceError("LAST_SIGN_IN_METHOD");
    await tx.account.delete({ where: { id: account.id } });
    await writeAudit(tx, {
      action: "PROVIDER_UNLINKED",
      userId,
      entityType: "Account",
      entityId: account.id,
      providerId: account.providerId,
    });
    return { status: true };
  });
}
export async function listAccounts(db: PrismaClient, userId: string) {
  return db.account.findMany({
    where: { userId },
    select: { id: true, accountId: true, providerId: true },
    orderBy: { createdAt: "asc" },
  });
}
