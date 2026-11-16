import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { emailSchema } from "@/lib/validation";

export function passwordRateKey(email: string) {
  return createHash("sha256").update(emailSchema.parse(email)).digest("hex");
}

/** Fixed windows; conditional UPSERT makes a slot reservation atomic across processes. */
export async function consumeRateLimit(
  db: PrismaClient,
  key: string,
  maximum: number,
  windowSeconds: number,
  now = Date.now(),
) {
  const timestamp = BigInt(now);
  const cutoff = BigInt(now - windowSeconds * 1000);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest")
    VALUES (${randomUUID()}, ${key}, 1, ${timestamp})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."lastRequest" <= ${cutoff} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "lastRequest" = CASE WHEN "RateLimit"."lastRequest" <= ${cutoff} THEN ${timestamp} ELSE "RateLimit"."lastRequest" END
    WHERE "RateLimit"."lastRequest" <= ${cutoff} OR "RateLimit"."count" < ${maximum}
    RETURNING "count"`;
  return rows.length === 1;
}

export function privateRateKey(scope: string, value: string) {
  return `${scope}:${createHash("sha256").update(value).digest("hex")}`;
}

export const authRateRules = {
  "/sign-in/email": { window: 60, max: 10 },
  "/sign-in/social": { window: 60, max: 10 },
  "/sign-up/email": { window: 600, max: 5 },
  "/send-verification-email": { window: 900, max: 3 },
  "/request-password-reset": { window: 900, max: 3 },
  "/verify-email": { window: 600, max: 10 },
  "/reset-password*": { window: 600, max: 10 },
  "/callback/*": { window: 60, max: 20 },
};
