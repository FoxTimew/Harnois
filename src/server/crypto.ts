import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey(hex: string) {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("Invalid encryption key");
  return Buffer.from(hex, "hex");
}

/** The context binds ciphertext to its owner and purpose (for example totp:<userId>). */
export function encryptSecret(plaintext: string, key: string, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(key), iv);
  cipher.setAAD(Buffer.from(`harnois:v1:${context}`));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptSecret(value: string, key: string, context: string) {
  const parts = value.split(":");
  if (
    parts.length !== 4 ||
    parts[0] !== "v1" ||
    parts.slice(1).some((part) => !/^[A-Za-z0-9_-]+$/.test(part))
  )
    throw new Error("Invalid encrypted value");
  const [, iv, tag, ciphertext] = parts.map((part) =>
    Buffer.from(part, "base64url"),
  );
  if (iv.length !== 12 || tag.length !== 16)
    throw new Error("Invalid encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(key), iv);
  decipher.setAAD(Buffer.from(`harnois:v1:${context}`));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
