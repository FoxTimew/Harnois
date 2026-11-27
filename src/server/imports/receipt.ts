import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/server/auth/service-access";
import { ServiceError } from "@/server/services/errors";

export const digest = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const owner = (domain: string, actor: Actor) =>
  `${domain}-import:${actor.userId}:${actor.sessionId}`;
export type ImportProof = {
  fileHash: string;
  baseline: string;
  planHash: string;
  options: unknown;
};
export async function createReceipt(
  tx: Prisma.TransactionClient,
  domain: string,
  actor: Actor,
  proof: ImportProof,
) {
  const identifier = owner(domain, actor),
    previewId = randomUUID(),
    expiresAt = new Date(Date.now() + 15 * 60_000);
  const previous = await tx.verification.findMany({
    where: { identifier },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    skip: 19,
  });
  if (previous.length)
    await tx.verification.deleteMany({
      where: { id: { in: previous.map((r) => r.id) } },
    });
  await tx.verification.create({
    data: {
      id: previewId,
      identifier,
      expiresAt,
      value: JSON.stringify(proof),
    },
  });
  return { previewId, expiresAt: expiresAt.toISOString() };
}
export async function readReceipt(
  tx: Prisma.TransactionClient,
  domain: string,
  actor: Actor,
  id: string,
  bytes: Uint8Array,
  options: unknown,
) {
  const receipt = await tx.verification.findFirst({
    where: {
      id,
      identifier: owner(domain, actor),
      expiresAt: { gt: new Date() },
    },
  });
  if (!receipt) throw new ServiceError("PREVIEW_EXPIRED", 409);
  const proof = JSON.parse(receipt.value) as ImportProof;
  if (
    proof.fileHash !== digest(bytes) ||
    JSON.stringify(proof.options) !== JSON.stringify(options)
  )
    throw new ServiceError("PREVIEW_CHANGED", 409);
  return proof;
}
export function validateReceipt(
  recorded: ImportProof,
  plan: Pick<ImportProof, "baseline" | "planHash">,
) {
  if (
    plan.baseline !== recorded.baseline ||
    plan.planHash !== recorded.planHash
  )
    throw new ServiceError("PREVIEW_CHANGED", 409);
}
export async function consumeReceipt(
  tx: Prisma.TransactionClient,
  domain: string,
  actor: Actor,
  id: string,
) {
  const { count } = await tx.verification.deleteMany({
    where: {
      id,
      identifier: owner(domain, actor),
      expiresAt: { gt: new Date() },
    },
  });
  if (count !== 1) throw new ServiceError("PREVIEW_EXPIRED", 409);
}
