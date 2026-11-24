import { describe, expect, it } from "vitest";
import {
  flowCookieOptions,
  invitationCookieName,
  readFlowCookie,
  signFlowCookie,
} from "@/server/auth/flow-cookie";
import { passwordRateKey } from "@/server/auth/rate-limit";
import { parseServerEnv } from "@/server/env";
import { assertMailConfigured } from "@/server/mail";
import { renderEmail } from "@/server/mail/templates";

const secret = "test-only-cookie-secret-at-least-32-characters";
const minimum = {
  DATABASE_URL: "postgresql://test:test@localhost/harnois_test",
  BETTER_AUTH_SECRET: secret,
  BETTER_AUTH_URL: "http://localhost:3000",
  ENCRYPTION_KEY: "ab".repeat(32),
};
describe("authentication boundary helpers", () => {
  it("signs an invitation ID with a ten minute expiry", () => {
    const cookie = signFlowCookie(
      { id: "invitation-id" },
      invitationCookieName,
      secret,
      1000,
    );
    const headers = new Headers({
      cookie: `${invitationCookieName}=${cookie}`,
    });
    expect(
      readFlowCookie(headers, invitationCookieName, secret, 1001)?.id,
    ).toBe("invitation-id");
    expect(
      readFlowCookie(headers, invitationCookieName, secret, 601_000),
    ).toBeNull();
    expect(
      readFlowCookie(headers, invitationCookieName, "different-secret", 1001),
    ).toBeNull();
    expect(
      readFlowCookie(
        new Headers({
          cookie: `${invitationCookieName}=tampered.${cookie.split(".")[1]}`,
        }),
        invitationCookieName,
        secret,
        1001,
      ),
    ).toBeNull();
  });
  it("uses HttpOnly, SameSite=Lax and Secure outside localhost", () => {
    expect(flowCookieOptions("https://inventory.atlasv.io")).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 600,
    });
    expect(flowCookieOptions("http://localhost:3000").secure).toBe(false);
  });
  it("hashes the normalized email for password counters", () => {
    expect(passwordRateKey(" Alice@Example.org ")).toBe(
      passwordRateKey("alice@example.org"),
    );
    expect(passwordRateKey("alice@example.org")).toMatch(/^[a-f0-9]{64}$/);
  });
  it("starts with no SMTP configuration but fails clearly when sending is requested", () => {
    const env = parseServerEnv(minimum);
    expect(() => assertMailConfigured(env)).toThrow(
      "EMAIL_TRANSPORT_UNAVAILABLE",
    );
  });
  it("allows a partial SMTP configuration at startup and rejects it at send time", () => {
    const env = parseServerEnv({
      ...minimum,
      SMTP_HOST: "localhost",
      SMTP_PORT: "1025",
      SMTP_FROM: "test@example.org",
      SMTP_USER: "test",
    });
    expect(() => assertMailConfigured(env)).toThrow(
      "EMAIL_TRANSPORT_UNAVAILABLE",
    );
  });
  it("requires HTTPS off localhost and a concrete Microsoft tenant for HTTPS", () => {
    expect(() =>
      parseServerEnv({ ...minimum, BETTER_AUTH_URL: "http://192.168.1.63" }),
    ).toThrow("BETTER_AUTH_URL");
    expect(() =>
      parseServerEnv({
        ...minimum,
        BETTER_AUTH_URL: "https://inventory.atlasv.io",
        MICROSOFT_CLIENT_ID: "test",
        MICROSOFT_CLIENT_SECRET: "test",
        MICROSOFT_TENANT_ID: "common",
      }),
    ).toThrow("MICROSOFT_TENANT_ID");
  });
  it.each(["invitation", "verification", "password-reset"] as const)(
    "renders the %s email in French, with escaped HTML and plain text",
    (template) => {
      const result = renderEmail(
        template,
        'https://example.org/?token=test&x="value"',
      );
      expect(result.html).toContain('lang="fr"');
      expect(result.html).toContain("&amp;x=&quot;value&quot;");
      expect(result.text).toContain("Harnois");
      expect(result.subject.length).toBeGreaterThan(0);
    },
  );
});
