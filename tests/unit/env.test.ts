import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/server/env";

const minimum = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/harnois_test",
  BETTER_AUTH_SECRET: "test-secret-with-at-least-32-characters",
  BETTER_AUTH_URL: "http://localhost:3000",
  ENCRYPTION_KEY: "ab".repeat(32),
};

describe("server environment", () => {
  it("accepts only the four CI variables", () => {
    expect(parseServerEnv(minimum).DATABASE_URL).toBe(minimum.DATABASE_URL);
  });
  it.each(Object.keys(minimum))("requires %s", (key) => {
    expect(() => parseServerEnv({ ...minimum, [key]: undefined })).toThrow(key);
  });
  it.each(["ab".repeat(31), "ab".repeat(33), "z".repeat(64)])(
    "rejects malformed encryption keys",
    (key) => {
      expect(() => parseServerEnv({ ...minimum, ENCRYPTION_KEY: key })).toThrow(
        "ENCRYPTION_KEY",
      );
    },
  );
  it("accepts blank external integration settings", () => {
    expect(
      parseServerEnv({
        ...minimum,
        GOOGLE_CLIENT_ID: "",
        GOOGLE_CLIENT_SECRET: "",
        S3_ENDPOINT: "",
      }).GOOGLE_CLIENT_ID,
    ).toBeUndefined();
  });
  it("rejects partial OAuth configurations", () => {
    expect(() =>
      parseServerEnv({ ...minimum, MICROSOFT_CLIENT_ID: "configured" }),
    ).toThrow("MICROSOFT_TENANT_ID");
  });
  it("does not include supplied secrets in error messages", () => {
    const secret = "sensitive-invalid-key";
    try {
      parseServerEnv({ ...minimum, ENCRYPTION_KEY: secret });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
      expect(String(error)).not.toContain(minimum.DATABASE_URL);
      return;
    }
    throw new Error("Expected configuration validation to fail");
  });
  it("parses false as false for path style", () => {
    expect(
      parseServerEnv({ ...minimum, S3_FORCE_PATH_STYLE: "false" })
        .S3_FORCE_PATH_STYLE,
    ).toBe(false);
  });
});
