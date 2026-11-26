import { describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret } from "@/server/crypto";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  matchesRecoveryCode,
} from "@/server/auth/recovery-codes";
import { recoveryCodeSchema } from "@/lib/mfa-validation";
import { isRecent, isMfaMandatory } from "@/server/auth/mfa-policy";
import { safeReturnUrl } from "@/lib/return-url";
const key = "ab".repeat(32);
describe("MFA security primitives", () => {
  it("encrypts with a random IV and binds the owner and purpose", () => {
    const value = encryptSecret("test secret", key, "totp:user-a");
    expect(value).toMatch(/^v1:[\w-]{16}:[\w-]{22}:[\w-]+$/);
    expect(value).not.toContain("test secret");
    expect(decryptSecret(value, key, "totp:user-a")).toBe("test secret");
    expect(encryptSecret("test secret", key, "totp:user-a")).not.toBe(value);
    expect(() => decryptSecret(value, key, "totp:user-b")).toThrow();
    expect(() =>
      decryptSecret(value, "cd".repeat(32), "totp:user-a"),
    ).toThrow();
    const parts = value.split(":");
    parts[2] = Buffer.alloc(16).toString("base64url");
    expect(() => decryptSecret(parts.join(":"), key, "totp:user-a")).toThrow();
  });
  it.each(["v2:a:b:c", "v1:a:b:c", "v1:a:b:c:extra", "cleartext"])(
    "rejects invalid ciphertext %s",
    (value) => expect(() => decryptSecret(value, key, "totp:user-a")).toThrow(),
  );
  it("generates ten 80-bit codes, normalizes and binds their hashes to the user", () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code).toMatch(
        /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}(?:-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}){3}$/,
      );
      const normalized = recoveryCodeSchema.parse({
        code: code.toLowerCase().replaceAll("-", " "),
      }).code;
      expect(normalized).toHaveLength(16);
      const hash = hashRecoveryCode("a", code);
      expect(hash).toMatch(/^v1:[a-f0-9]{64}$/);
      expect(matchesRecoveryCode(hash, hashRecoveryCode("a", normalized))).toBe(
        true,
      );
      expect(matchesRecoveryCode(hash, hashRecoveryCode("b", normalized))).toBe(
        false,
      );
    }
  });
  it("requires strict recent proof and rejects future timestamps", () => {
    const now = new Date();
    expect(isRecent(new Date(+now - 599_999), now)).toBe(true);
    expect(isRecent(new Date(+now - 600_000), now)).toBe(false);
    expect(isRecent(new Date(+now + 1), now)).toBe(false);
    expect(isRecent(null, now)).toBe(false);
  });
  it.each(["ADMIN", "IT_MANAGER", "TECHNICIAN"] as const)(
    "requires MFA for %s",
    (role) => expect(isMfaMandatory({ role, mfaEnforced: false })).toBe(true),
  );
  it("supports voluntary and individually enforced employees", () => {
    expect(isMfaMandatory({ role: "EMPLOYEE", mfaEnforced: false })).toBe(
      false,
    );
    expect(isMfaMandatory({ role: "EMPLOYEE", mfaEnforced: true })).toBe(true);
  });
  it.each([
    "https://evil.invalid",
    "//evil.invalid",
    "/\\evil.invalid",
    "/mfa/verify",
    "/profile%2fevil",
    "/profile/\\evil",
  ])("rejects unsafe return URL %s", (value) =>
    expect(safeReturnUrl(value)).toBe("/profile/security"),
  );
  it("preserves an internal return path and query", () =>
    expect(safeReturnUrl("/admin/invitations?filter=pending")).toBe(
      "/admin/invitations?filter=pending",
    ));
});
