import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authFixture,
  responseCookies,
  testPassword,
  type AuthFixture,
} from "../fixtures/auth";
import { prepareInvitation } from "@/server/auth/prepare-invitation";
import { requireUser } from "@/server/auth/require-user";
import { MfaService } from "@/server/services/mfa";
import { generate } from "otplib";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = {
  ...publicKey.export({ format: "jwk" }),
  kid: "harnois-test",
  use: "sig",
  alg: "RS256",
};
let f: AuthFixture;
let profile: { email: string; verified: boolean; subject: string };
function idToken(provider: "google" | "microsoft") {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT", kid: jwk.kid }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss:
        provider === "google"
          ? "https://accounts.google.com"
          : `https://login.microsoftonline.com/${f.env.MICROSOFT_TENANT_ID}/v2.0`,
      aud: `harnois-test-${provider}`,
      sub: profile.subject,
      oid: profile.subject,
      tid: f.env.MICROSOFT_TENANT_ID,
      email: profile.email,
      email_verified: profile.verified,
      name: "Test OAuth",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");
  const body = `${header}.${payload}`;
  return `${body}.${sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url")}`;
}
beforeEach(() => {
  f = authFixture(undefined, true);
  profile = { email: f.email(), verified: true, subject: randomUUID() };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (
        url === "https://www.googleapis.com/oauth2/v3/certs" ||
        url.includes("/discovery/v2.0/keys")
      )
        return Response.json({ keys: [jwk] });
      if (
        url === "https://oauth2.googleapis.com/token" ||
        url.endsWith("/oauth2/v2.0/token")
      )
        return Response.json({
          access_token: "test-only-access",
          refresh_token: "test-only-refresh",
          id_token: idToken(
            url.includes("googleapis") ? "google" : "microsoft",
          ),
          token_type: "Bearer",
          expires_in: 3600,
        });
      throw new Error("Unexpected external request in OAuth test");
    }),
  );
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await f.cleanup();
});

async function oauth(
  provider: "google" | "microsoft",
  cookie = "",
  linking = false,
  duringRedirect?: () => Promise<void>,
) {
  const start = await f.send(
    linking ? "/link-social" : "/sign-in/social",
    { provider, callbackURL: "/profile/security" },
    cookie,
  );
  expect(start.ok, `OAuth start status=${start.status}`).toBe(true);
  const url = new URL((await start.json()).url);
  const state = url.searchParams.get("state")!;
  const cookies = [cookie, responseCookies(start)].filter(Boolean).join("; ");
  await duringRedirect?.();
  return f.send(
    `/callback/${provider}?code=fixture-code&state=${encodeURIComponent(state)}`,
    undefined,
    cookies,
  );
}

describe("OAuth redirect flows with signed test IdP tokens and real PostgreSQL", () => {
  it.each(["google", "microsoft"] as const)(
    "rechecks the session at the %s linking callback",
    async (provider) => {
      const user = await f.user();
      const cookie = responseCookies(
        await f.send("/sign-in/email", {
          email: user.email,
          password: testPassword,
        }),
      );
      profile.email = user.email;
      const result = await oauth(provider, cookie, true, async () => {
        await f.db.session.deleteMany({ where: { userId: user.id } });
      });
      expect(result.headers.get("location")).toBe(
        "/login?error=authentication_failed",
      );
      expect(
        await f.db.account.count({
          where: { userId: user.id, providerId: provider },
        }),
      ).toBe(0);
    },
  );
  it.each(["google", "microsoft"] as const)(
    "refuses %s registration without an invitation and returns a neutral login error",
    async (provider) => {
      const result = await oauth(provider);
      expect(result.headers.get("location")).toBe(
        "/login?error=authentication_failed",
      );
      expect(await f.db.user.count({ where: { email: profile.email } })).toBe(
        0,
      );
    },
  );
  it.each(["google", "microsoft"] as const)(
    "accepts %s using a prepared, signed invitation cookie",
    async (provider) => {
      const { invitation, token } = await f.invitation({ role: "IT_MANAGER" });
      profile.email = `  ${invitation.email.toUpperCase()}  `;
      const prepared = await prepareInvitation(
        new Request(`${f.env.BETTER_AUTH_URL}/api/invitations/prepare`, {
          method: "POST",
          headers: {
            origin: f.env.BETTER_AUTH_URL,
            "content-type": "application/json",
            "x-real-ip": f.ip,
          },
          body: JSON.stringify({ token }),
        }),
        f.db,
        f.env,
      );
      expect(prepared.status).toBe(200);
      const cookie = responseCookies(prepared);
      expect(cookie.includes(token)).toBe(false);
      const result = await oauth(provider, cookie);
      expect(result.headers.get("location")).toContain("/profile/security");
      const user = await f.db.user.findUniqueOrThrow({
        where: { email: invitation.email },
      });
      expect(user.role).toBe("IT_MANAGER");
      expect(user.emailVerified).toBe(true);
      const account = await f.db.account.findFirstOrThrow({
        where: { userId: user.id, providerId: provider },
      });
      expect(account.accessToken).toBeNull();
      expect(account.refreshToken).toBeNull();
      expect(account.idToken).toBeNull();
      expect(
        result.headers
          .getSetCookie()
          .some(
            (value) =>
              value.startsWith("harnois.invitation=") &&
              value.includes("Max-Age=0"),
          ),
      ).toBe(true);
      expect(await f.db.session.count({ where: { userId: user.id } })).toBe(1);
    },
  );
  it("rejects a different OAuth email and preserves the invitation", async () => {
    const { invitation, cookie } = await f.invitation();
    const result = await oauth("google", cookie);
    expect(result.headers.get("location")).toBe(
      "/login?error=invitation_email_mismatch",
    );
    expect(
      (
        await f.db.invitation.findUniqueOrThrow({
          where: { id: invitation.id },
        })
      ).acceptedAt,
    ).toBeNull();
  });
  it.each(["expired", "revoked", "accepted"])(
    "refuses OAuth with a %s invitation",
    async (state) => {
      const { invitation, cookie } = await f.invitation({
        ...(state === "expired"
          ? { expiresAt: new Date(0) }
          : state === "revoked"
            ? { revokedAt: new Date() }
            : { acceptedAt: new Date() }),
      });
      profile.email = invitation.email;
      expect((await oauth("google", cookie)).headers.get("location")).toBe(
        "/login?error=authentication_failed",
      );
      expect(
        await f.db.user.count({ where: { email: invitation.email } }),
      ).toBe(0);
    },
  );
  it("does not implicitly link Microsoft, even with a verified email claim", async () => {
    const user = await f.user();
    profile.email = user.email;
    profile.verified = true;
    expect((await oauth("microsoft")).headers.get("location")).toBe(
      "/login?error=authentication_failed",
    );
    expect(
      await f.db.account.count({
        where: { userId: user.id, providerId: "microsoft" },
      }),
    ).toBe(0);
    expect(await f.db.session.count({ where: { userId: user.id } })).toBe(0);
  });
  it("refuses automatic Google linking and requires an explicit verified flow", async () => {
    const user = await f.user();
    profile.email = ` ${user.email.toUpperCase()} `;
    expect((await oauth("google")).headers.get("location")).toBe(
      "/login?error=authentication_failed",
    );
    expect(await f.db.account.count({ where: { userId: user.id } })).toBe(1);
    const cookie = responseCookies(
      await f.send("/sign-in/email", {
        email: user.email,
        password: testPassword,
      }),
    );
    expect(
      (await oauth("google", cookie, true)).headers.get("location"),
    ).toContain("/profile/security");
    expect(await f.db.user.count({ where: { email: user.email } })).toBe(1);
    expect(await f.db.account.count({ where: { userId: user.id } })).toBe(2);
  });
  it("blocks an administrator after real Google callbacks, both before setup and before MFA verification", async () => {
    const user = await f.user("ADMIN", false);
    profile.email = user.email;
    await f.db.account.create({
      data: {
        userId: user.id,
        providerId: "google",
        accountId: profile.subject,
      },
    });
    let cookie = responseCookies(await oauth("google"));
    const authorize = () =>
      requireUser({
        db: f.db,
        headers: new Headers({ cookie }),
        readSession: (headers) => f.auth.api.getSession({ headers }),
      });
    await expect(authorize()).rejects.toMatchObject({
      code: "MFA_SETUP_REQUIRED",
    });
    const blocked = await f.send(
      "/change-password",
      { currentPassword: testPassword, newPassword: testPassword },
      cookie,
    );
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).code).toBe("MFA_SETUP_REQUIRED");
    const session = await f.db.session.findFirstOrThrow({
      where: { userId: user.id },
    });
    const mfa = new MfaService({ db: f.db, env: f.env, mail: async () => {} });
    const { secret } = await mfa.startTotp(
      { userId: user.id, sessionId: session.id },
      {},
    );
    await mfa.confirmTotp(
      { userId: user.id, sessionId: session.id },
      { code: await generate({ secret }) },
    );
    await f.send("/sign-out", {}, cookie);
    cookie = responseCookies(await oauth("google"));
    await expect(authorize()).rejects.toMatchObject({ code: "MFA_REQUIRED" });
    const linking = await f.send(
      "/link-social",
      { provider: "microsoft" },
      cookie,
    );
    expect(linking.status).toBe(403);
    expect((await linking.json()).code).toBe("MFA_REQUIRED");
  });
  it("refuses unverified Google automatic linking", async () => {
    const user = await f.user();
    profile.email = user.email;
    profile.verified = false;
    expect((await oauth("google")).headers.get("location")).toBe(
      "/login?error=authentication_failed",
    );
    expect(await f.db.account.count({ where: { userId: user.id } })).toBe(1);
  });
  it("links Microsoft explicitly with a fresh active session", async () => {
    const user = await f.user();
    const cookie = responseCookies(
      await f.send("/sign-in/email", {
        email: user.email,
        password: testPassword,
      }),
    );
    profile.email = user.email;
    profile.verified = false;
    const result = await oauth("microsoft", cookie, true);
    expect(result.headers.get("location")).toContain("/profile/security");
    expect(
      await f.db.account.count({
        where: { userId: user.id, providerId: "microsoft" },
      }),
    ).toBe(1);
    expect(
      await f.db.auditLog.count({
        where: { userId: user.id, action: "PROVIDER_LINKED" },
      }),
    ).toBe(1);
  });
  it("refuses a disabled user's OAuth session", async () => {
    const user = await f.user();
    profile.email = user.email;
    await f.db.account.create({
      data: {
        userId: user.id,
        providerId: "google",
        accountId: profile.subject,
      },
    });
    await f.db.user.update({
      where: { id: user.id },
      data: { isActive: false },
    });
    expect((await oauth("google")).headers.get("location")).toBe(
      "/login?error=authentication_failed",
    );
    expect(await f.db.session.count({ where: { userId: user.id } })).toBe(0);
  });
});
