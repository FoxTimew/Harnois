import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateRecoveryCodes() {
  return Array.from({ length: 10 }, () => {
    // Sixteen independent five-bit symbols: exactly 80 bits, without modulo bias.
    const bytes = randomBytes(16);
    const value = Array.from(bytes, (byte) => alphabet[byte & 31]).join("");
    return value.match(/.{4}/g)!.join("-");
  });
}
export function hashRecoveryCode(userId: string, normalized: string) {
  return `v1:${createHash("sha256")
    .update(
      JSON.stringify([
        "harnois-recovery-v1",
        userId,
        normalized.replace(/[-\s]/g, "").toUpperCase(),
      ]),
    )
    .digest("hex")}`;
}
export function matchesRecoveryCode(expected: string, actual: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}
