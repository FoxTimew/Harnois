import { randomUUID } from "node:crypto";
import { generate } from "otplib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authFixture,
  responseCookies,
  testPassword,
  type AuthFixture,
} from "../fixtures/auth";
import { authenticator } from "../fixtures/authenticator";
import { MfaService, mfaRateKey, type MfaActor } from "@/server/services/mfa";
import { requireUser } from "@/server/auth/require-user";
import { loadMfaContext, mfaNamespace } from "@/server/auth/mfa-policy";
import { handleMfaRequest, mfaEndpoints } from "@/server/auth/mfa-http";
import { prepareInvitation } from "@/server/auth/prepare-invitation";
import { decryptSecret } from "@/server/crypto";
import type { UserRole } from "@/generated/prisma/client";
let f: AuthFixture;
let service: MfaService;
let now: Date;
beforeEach(() => {
  f = authFixture();
  now = new Date();
  service = new MfaService({
    db: f.db,
    env: f.env,
    now: () => now,
    mail: async (message) => {
      f.messages.push(message);
    },
  });
});
afterEach(async () => {
  await f.cleanup();
});
async function identity(role: UserRole = "EMPLOYEE") {
  const user = await f.user(role);
  const session = await f.db.session.create({
    data: {
      token: randomUUID(),
      userId: user.id,
      createdAt: new Date(+now - 1000),
      expiresAt: new Date(+now + 86400_000),
    },
  });
  const actor: MfaActor = { userId: user.id, sessionId: session.id, ip: f.ip };
  return { user, session, actor };
}
const token = (secret: string, epoch = +now) =>
  generate({
    secret,
    algorithm: "sha1",
    digits: 6,
    period: 30,
    epoch: Math.floor(epoch / 1000),
  });
async function enroll(actor: MfaActor) {
  const { secret } = await service.startTotp(actor, {});
  const result = await service.confirmTotp(actor, {
    code: await token(secret),
  });
  return { secret, codes: result.recoveryCodes! };
}
async function register(
  actor: MfaActor,
  device = authenticator(),
  flags = 0x41,
) {
  const { options, challengeId } = await service.registrationOptions(actor, {
    name: "Test key",
  });
  const response = device.registration(options.challenge, { flags });
  const result = await service.confirmRegistration(actor, {
    challengeId,
    response,
  });
  return { device, result };
}
const reader =
  (userId: string, session: { id: string; createdAt: Date; expiresAt: Date }) =>
  async () => ({ user: { id: userId }, session });
describe("MFA services and HTTP gates on real PostgreSQL", () => {
  it("requires recent MFA for password changes, audits success and resets MFA on the replacement session", async () => {
    const user = await f.user();
    const cookie = responseCookies(
      await f.send("/sign-in/email", {
        email: user.email,
        password: testPassword,
      }),
    );
    now = new Date();
    const session = await f.db.session.findFirstOrThrow({
      where: { userId: user.id },
    });
    const actor = { userId: user.id, sessionId: session.id };
    const { codes } = await enroll(actor);
    await f.db.session.update({
      where: { id: session.id },
      data: { mfaVerifiedAt: new Date(Date.now() - 601_000) },
    });
    const body = {
      currentPassword: testPassword,
      newPassword: "Replacement-test-password-42",
      revokeOtherSessions: true,
    };
    expect((await f.send("/change-password", body, cookie)).status).toBe(403);
    await service.verifyRecovery(actor, { code: codes[0] });
    expect(
      (
        await f.send(
          "/change-password",
          { ...body, currentPassword: "wrong-password" },
          cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      await f.db.auditLog.count({
        where: { userId: user.id, action: "PASSWORD_CHANGED" },
      }),
    ).toBe(0);
    const result = await f.send("/change-password", body, cookie);
    expect(result.status).toBe(200);
    expect(await f.db.session.count({ where: { id: session.id } })).toBe(0);
    expect(
      await f.db.session.count({
        where: { userId: user.id, mfaVerifiedAt: null },
      }),
    ).toBe(1);
    expect(
      await f.db.auditLog.count({
        where: { userId: user.id, action: "PASSWORD_CHANGED" },
      }),
    ).toBe(1);
  });
  it("recomputes policy after promotion and ignores unconfirmed factors and recovery codes", async () => {
    const { user, session, actor } = await identity();
    await service.startTotp(actor, {});
    const context = () =>
      requireUser({
        db: f.db,
        headers: new Headers(),
        readSession: reader(user.id, session),
      });
    expect((await context()).mfa.state).toBe("ready");
    await f.db.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    await expect(context()).rejects.toMatchObject({
      code: "MFA_SETUP_REQUIRED",
    });
    await f.db.recoveryCode.create({
      data: { userId: user.id, codeHash: "test-only" },
    });
    expect((await loadMfaContext(f.db, user.id, session.id)).mfa.state).toBe(
      "setup",
    );
    await expect(
      service.verifyRecovery(actor, { code: "ABCD-EFGH-JKLM-NPQR" }),
    ).rejects.toMatchObject({ code: "MFA_SETUP_REQUIRED" });
  });
  it("encrypts TOTP, confirms it only once and generates only hashed recovery codes", async () => {
    const { actor } = await identity("ADMIN");
    const { secret, qrCode } = await service.startTotp(actor, {});
    expect(qrCode).toMatch(/^data:image\/png;base64,/);
    const factor = await f.db.totpFactor.findUniqueOrThrow({
      where: { userId: actor.userId },
    });
    expect(factor.confirmedAt).toBeNull();
    expect(factor.secretEncrypted).toMatch(/^v1:/);
    expect(factor.secretEncrypted).not.toContain(secret);
    expect(
      decryptSecret(
        factor.secretEncrypted,
        f.env.ENCRYPTION_KEY,
        `totp:${actor.userId}`,
      ),
    ).toBe(secret);
    const result = await service.confirmTotp(actor, {
      code: await token(secret),
    });
    expect(result.recoveryCodes).toHaveLength(10);
    expect((await service.status(actor)).remaining).toBe(10);
    const stored = await f.db.recoveryCode.findMany({
      where: { userId: actor.userId },
    });
    expect(
      stored.every((code) => /^v1:[a-f0-9]{64}$/.test(code.codeHash)),
    ).toBe(true);
    expect(
      (await loadMfaContext(f.db, actor.userId, actor.sessionId)).mfa.recent,
    ).toBe(true);
    const audit = JSON.stringify(
      await f.db.auditLog.findMany({ where: { userId: actor.userId } }),
    );
    for (const value of [
      secret,
      ...result.recoveryCodes!,
      f.env.ENCRYPTION_KEY,
    ])
      expect(audit).not.toContain(value);
    expect(f.messages.at(-1)?.template).toBe("security");
  });
  it("rejects replayed/out-of-window TOTP and serializes simultaneous verification", async () => {
    const { actor } = await identity("ADMIN");
    const { secret } = await enroll(actor);
    await expect(
      service.verifyTotp(actor, { code: await token(secret) }),
    ).rejects.toMatchObject({ code: "MFA_INVALID_PROOF" });
    await expect(
      service.verifyTotp(actor, { code: await token(secret, +now + 90_000) }),
    ).rejects.toMatchObject({ code: "MFA_INVALID_PROOF" });
    now = new Date(+now + 30_000);
    const code = await token(secret);
    const results = await Promise.allSettled([
      service.verifyTotp(actor, { code }),
      service.verifyTotp(actor, { code }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (
        await f.db.rateLimit.findUniqueOrThrow({
          where: { key: mfaRateKey(actor.userId) },
        })
      ).count,
    ).toBe(3);
  });
  it("accepts exactly the adjacent TOTP period", async () => {
    const { actor } = await identity();
    const { secret } = await enroll(actor);
    now = new Date(+now + 30_000);
    await expect(
      service.verifyTotp(actor, { code: await token(secret, +now + 30_000) }),
    ).resolves.toEqual({ verified: true });
  });
  it("binds pending TOTP enrollment to the latest requesting session", async () => {
    const { actor, user } = await identity("ADMIN");
    const other = await f.db.session.create({
      data: {
        userId: user.id,
        token: randomUUID(),
        createdAt: new Date(+now - 1000),
        expiresAt: new Date(+now + 86400_000),
      },
    });
    await service.startTotp(actor, {});
    const { secret } = await service.startTotp(
      { ...actor, sessionId: other.id },
      {},
    );
    await expect(
      service.confirmTotp(actor, { code: await token(secret) }),
    ).rejects.toMatchObject({ code: "MFA_INVALID_PROOF" });
  });
  it("requires recent primary proof before first enrollment and never marks it as MFA", async () => {
    const { actor } = await identity("ADMIN");
    await f.db.session.update({
      where: { id: actor.sessionId },
      data: { createdAt: new Date(+now - 601_000) },
    });
    await expect(service.startTotp(actor, {})).rejects.toMatchObject({
      code: "REAUTHENTICATION_REQUIRED",
    });
    await service.confirmPrimary(actor, { password: testPassword });
    expect(
      (await f.db.session.findUniqueOrThrow({ where: { id: actor.sessionId } }))
        .mfaVerifiedAt,
    ).toBeNull();
    await expect(service.startTotp(actor, {})).resolves.toHaveProperty(
      "secret",
    );
  });
  it("registers and verifies a signed WebAuthn authenticator with 0->0 counters", async () => {
    const { actor } = await identity("ADMIN");
    const { device } = await register(actor);
    for (let i = 0; i < 2; i++) {
      const { options, challengeId } = await service.authenticationOptions(
        actor,
        {},
      );
      expect(options.userVerification).toBe("preferred");
      await expect(
        service.verifyAuthentication(actor, {
          challengeId,
          response: device.assertion(options.challenge),
        }),
      ).resolves.toEqual({ verified: true });
    }
    expect(
      (
        await f.db.webAuthnCredential.findFirstOrThrow({
          where: { userId: actor.userId },
        })
      ).transports,
    ).toEqual(["usb", "hybrid"]);
    const enrollment = await service.registrationOptions(actor, {
      name: "Second key",
    });
    expect(
      enrollment.options.excludeCredentials?.map((key) => key.id),
    ).toContain(device.id);
    expect(enrollment.options.authenticatorSelection).toMatchObject({
      residentKey: "preferred",
      userVerification: "preferred",
    });
    expect(
      enrollment.options.authenticatorSelection?.authenticatorAttachment,
    ).toBeUndefined();
    expect(enrollment.options.attestation).toBe("none");
  });
  it.each([0x41, 0x59])(
    "rejects equal/regressing counters, including synced passkeys (flags=%i)",
    async (flags) => {
      const { actor } = await identity();
      const { device } = await register(actor, authenticator(), flags);
      const assertion = async (counter: number) => {
        const { options, challengeId } = await service.authenticationOptions(
          actor,
          {},
        );
        return service.verifyAuthentication(actor, {
          challengeId,
          response: device.assertion(options.challenge, {
            counter,
            flags: flags & ~0x40,
          }),
        });
      };
      await assertion(5);
      await expect(assertion(5)).rejects.toMatchObject({
        code: "MFA_INVALID_PROOF",
      });
      await expect(assertion(4)).rejects.toMatchObject({
        code: "MFA_INVALID_PROOF",
      });
      await expect(assertion(0)).rejects.toMatchObject({
        code: "MFA_INVALID_PROOF",
      });
      expect(
        await f.db.auditLog.count({
          where: {
            userId: actor.userId,
            action: "MFA_VERIFICATION_FAILED",
            changes: { path: ["reason"], equals: "COUNTER_REGRESSION" },
          },
        }),
      ).toBe(3);
    },
  );
  it("consumes failed WebAuthn challenges and rejects replay and expiry", async () => {
    const { actor } = await identity();
    const { device } = await register(actor);
    const attempt = await service.authenticationOptions(actor, {});
    await expect(
      service.verifyAuthentication(actor, {
        challengeId: attempt.challengeId,
        response: device.assertion(attempt.options.challenge, {
          origin: "https://evil.invalid",
        }),
      }),
    ).rejects.toMatchObject({ code: "MFA_INVALID_PROOF" });
    await expect(
      service.verifyAuthentication(actor, {
        challengeId: attempt.challengeId,
        response: device.assertion(attempt.options.challenge),
      }),
    ).rejects.toMatchObject({ code: "MFA_INVALID_PROOF" });
    const expired = await service.authenticationOptions(actor, {});
    now = new Date(+now + 300_000);
    await expect(
      service.verifyAuthentication(actor, {
        challengeId: expired.challengeId,
        response: device.assertion(expired.options.challenge),
      }),
    ).rejects.toMatchObject({ code: "MFA_INVALID_PROOF" });
    expect(
      await f.db.verification.count({
        where: { id: { in: [attempt.challengeId, expired.challengeId] } },
      }),
    ).toBe(0);
  });
  it("rejects another session, purpose, owner, RP, user handle and absent user presence", async () => {
    const first = await identity();
    const second = await identity();
    const { device } = await register(first.actor);
    await register(second.actor);
    const otherSession = await f.db.session.create({
      data: {
        userId: first.user.id,
        token: randomUUID(),
        expiresAt: new Date(+now + 86400_000),
      },
    });
    const attempt = await service.authenticationOptions(first.actor, {});
    await expect(
      service.verifyAuthentication(
        { ...first.actor, sessionId: otherSession.id },
        {
          challengeId: attempt.challengeId,
          response: device.assertion(attempt.options.challenge),
        },
      ),
    ).rejects.toMatchObject({ code: "MFA_INVALID_PROOF" });
    await service.verifyAuthentication(first.actor, {
      challengeId: attempt.challengeId,
      response: device.assertion(attempt.options.challenge),
    });
    for (const options of [
      { rpId: "evil.invalid" },
      { userHandle: Buffer.from("other-user").toString("base64url") },
      { flags: 0 },
    ]) {
      const next = await service.authenticationOptions(first.actor, {});
      await expect(
        service.verifyAuthentication(first.actor, {
          challengeId: next.challengeId,
          response: device.assertion(next.options.challenge, options),
        }),
      ).rejects.toMatchObject({ code: "MFA_INVALID_PROOF" });
    }
    const foreign = await service.authenticationOptions(second.actor, {});
    await expect(
      service.verifyAuthentication(second.actor, {
        challengeId: foreign.challengeId,
        response: device.assertion(foreign.options.challenge),
      }),
    ).rejects.toMatchObject({ code: "MFA_INVALID_PROOF" });
  });
  it("atomically consumes recovery codes, normalizes input, and invalidates every old code on regeneration", async () => {
    const { actor } = await identity();
    const { codes } = await enroll(actor);
    const results = await Promise.allSettled([
      service.verifyRecovery(actor, {
        code: codes[0].toLowerCase().replaceAll("-", " "),
      }),
      service.verifyRecovery(actor, { code: codes[0] }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await service.status(actor)).remaining).toBe(9);
    const regenerated = await service.regenerateCodes(actor, {});
    await expect(
      service.verifyRecovery(actor, { code: codes[1] }),
    ).rejects.toMatchObject({ code: "MFA_INVALID_PROOF" });
    await expect(
      service.verifyRecovery(actor, { code: regenerated.recoveryCodes[0] }),
    ).resolves.toMatchObject({ verified: true, remaining: 9 });
    expect(
      (await f.db.session.findUniqueOrThrow({ where: { id: actor.sessionId } }))
        .mfaMethod,
    ).toBe("RECOVERY_CODE");
  });
  it("shares five-failure blocking across methods, persists failures, and does not extend the block", async () => {
    const { actor } = await identity();
    const { secret, codes } = await enroll(actor);
    const { device } = await register(actor);
    const wrong = await token(secret, +now + 180_000);
    for (let i = 0; i < 2; i++)
      await expect(
        service.verifyTotp(actor, { code: wrong }),
      ).rejects.toMatchObject({ code: "MFA_INVALID_PROOF" });
    await expect(
      service.verifyRecovery(actor, { code: "AAAA-AAAA-AAAA-AAAA" }),
    ).rejects.toMatchObject({ code: "MFA_INVALID_PROOF" });
    const attempt = await service.authenticationOptions(actor, {});
    await expect(
      service.verifyAuthentication(actor, {
        challengeId: attempt.challengeId,
        response: device.assertion("wrong"),
      }),
    ).rejects.toMatchObject({ code: "MFA_INVALID_PROOF" });
    await expect(
      service.verifyRecovery(actor, { code: "AAAA-AAAA-AAAA-AAAA" }),
    ).rejects.toMatchObject({ code: "MFA_RATE_LIMITED", retryAfter: 900 });
    now = new Date(+now + 60_000);
    await expect(
      service.verifyRecovery(actor, { code: codes[0] }),
    ).rejects.toMatchObject({ code: "MFA_RATE_LIMITED", retryAfter: 840 });
    expect((await service.status(actor)).remaining).toBe(10);
    const row = await f.db.rateLimit.findUniqueOrThrow({
      where: { key: mfaRateKey(actor.userId) },
    });
    expect(row.key).not.toContain(actor.userId);
    expect(
      await f.db.auditLog.count({
        where: { userId: actor.userId, action: "MFA_BLOCKED" },
      }),
    ).toBe(1);
    now = new Date(+now + 840_000);
    await expect(
      service.verifyRecovery(actor, { code: codes[0] }),
    ).resolves.toMatchObject({ verified: true });
  });
  it("serializes concurrent removal and preserves the mandatory last factor", async () => {
    const { actor } = await identity("ADMIN");
    await enroll(actor);
    await register(actor);
    const status = await service.status(actor);
    const results = await Promise.allSettled([
      service.removeFactor(actor, { kind: "TOTP", id: status.totp!.id }),
      service.removeFactor(actor, { kind: "WEBAUTHN", id: status.keys[0].id }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "LAST_MFA_FACTOR" },
    });
    expect((await service.status(actor)).hasFactor).toBe(true);
  });
  it("permits voluntary last-factor removal and invalidates recovery codes", async () => {
    const { actor } = await identity();
    await enroll(actor);
    const status = await service.status(actor);
    await service.removeFactor(actor, { kind: "TOTP", id: status.totp!.id });
    expect(await service.status(actor)).toMatchObject({
      hasFactor: false,
      remaining: 0,
      state: "ready",
    });
  });
  it("requires recent MFA for sensitive mutations and refuses a primary-password downgrade", async () => {
    const { actor } = await identity("ADMIN");
    await enroll(actor);
    const status = await service.status(actor);
    now = new Date(+now + 600_000);
    for (const call of [
      () => service.startTotp(actor, {}),
      () => service.registrationOptions(actor, { name: "New" }),
      () => service.regenerateCodes(actor, {}),
      () => service.removeFactor(actor, { kind: "TOTP", id: status.totp!.id }),
    ])
      await expect(call()).rejects.toMatchObject({
        code: "REAUTHENTICATION_REQUIRED",
      });
    await expect(
      service.confirmPrimary(actor, { password: testPassword }),
    ).rejects.toMatchObject({ code: "MFA_REQUIRED" });
  });
  it("resets another user's factors, challenges and every session, but never itself or as a non-admin", async () => {
    const admin = await identity("ADMIN");
    await enroll(admin.actor);
    const target = await identity();
    await enroll(target.actor);
    await register(target.actor);
    await service.authenticationOptions(target.actor, {});
    await f.db.session.create({
      data: {
        token: randomUUID(),
        userId: target.user.id,
        expiresAt: new Date(+now + 60_000),
      },
    });
    await expect(
      service.resetByAdmin(admin.actor, {
        email: admin.user.email,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "MFA_SELF_RESET_FORBIDDEN" });
    await expect(
      service.resetByAdmin(target.actor, {
        email: admin.user.email,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    now = new Date(+now + 600_000);
    await expect(
      service.resetByAdmin(admin.actor, {
        email: target.user.email,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
    now = new Date(+now - 600_000);
    await service.resetByAdmin(admin.actor, {
      email: target.user.email.toUpperCase(),
      confirmed: true,
    });
    expect(
      await f.db.session.count({ where: { userId: target.user.id } }),
    ).toBe(0);
    expect(
      await f.db.totpFactor.count({ where: { userId: target.user.id } }),
    ).toBe(0);
    expect(
      await f.db.webAuthnCredential.count({
        where: { userId: target.user.id },
      }),
    ).toBe(0);
    expect(
      await f.db.recoveryCode.count({ where: { userId: target.user.id } }),
    ).toBe(0);
    expect(
      await f.db.verification.count({
        where: { identifier: { startsWith: mfaNamespace(target.user.id) } },
      }),
    ).toBe(0);
    await expect(service.status(target.actor)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
  it("commits before notification and records mail failure without undoing the action", async () => {
    const { actor } = await identity("ADMIN");
    const failingMail = new MfaService({
      db: f.db,
      env: f.env,
      now: () => now,
      mail: async () => {
        expect(
          await f.db.totpFactor.count({
            where: { userId: actor.userId, confirmedAt: { not: null } },
          }),
        ).toBe(1);
        throw new Error("private SMTP details");
      },
    });
    const { secret } = await failingMail.startTotp(actor, {});
    await expect(
      failingMail.confirmTotp(actor, { code: await token(secret) }),
    ).resolves.toMatchObject({ verified: true });
    expect(
      await f.db.auditLog.count({
        where: { userId: actor.userId, action: "MFA_NOTIFICATION_FAILED" },
      }),
    ).toBe(1);
  });
  it("exposes only explicit MFA endpoints, rejects CSRF and keeps sensitive responses uncached", async () => {
    const { actor, user, session } = await identity("ADMIN");
    const send = (
      path: string,
      input: unknown,
      origin = f.env.BETTER_AUTH_URL,
    ) =>
      handleMfaRequest(
        new Request(`${f.env.BETTER_AUTH_URL}/api/mfa/${path}`, {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify(input),
        }),
        path,
        service,
        reader(user.id, session),
      );
    expect((await send("totp/enroll", {}, "https://evil.invalid")).status).toBe(
      403,
    );
    expect((await send("resetFromCli", {})).status).toBe(404);
    expect((await send("__proto__", {})).status).toBe(404);
    const response = await send("totp/enroll", {});
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await send("recovery/regenerate", {})).status).toBe(403);
    expect(Object.keys(mfaEndpoints)).toHaveLength(13);
    await enroll(actor);
  });
  it("blocks invitation preparation for an incomplete session before revealing invitation data", async () => {
    const { user, session } = await identity("ADMIN");
    const { token } = await f.invitation();
    const response = await prepareInvitation(
      new Request(`${f.env.BETTER_AUTH_URL}/api/invitations/prepare`, {
        method: "POST",
        headers: {
          origin: f.env.BETTER_AUTH_URL,
          "content-type": "application/json",
          cookie: "better-auth.session_token=test-session",
        },
        body: JSON.stringify({ token }),
      }),
      f.db,
      f.env,
      reader(user.id, session),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "MFA_SETUP_REQUIRED" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("blocks incomplete Better Auth sessions on all mutations, permitting only session GET and sign-out POST", async () => {
    const user = await f.user("ADMIN");
    const cookie = responseCookies(
      await f.send("/sign-in/email", {
        email: user.email,
        password: testPassword,
      }),
    );
    for (const [path, body] of [
      [
        "/change-password",
        {
          currentPassword: testPassword,
          newPassword: "Updated-test-password-42",
        },
      ],
      ["/link-social", { provider: "google" }],
      ["/unlink-account", { accountId: "id" }],
      ["/update-user", { name: "Changed" }],
      ["/revoke-sessions", {}],
    ] as const) {
      const response = await f.send(path, body, cookie);
      expect(response.status, path).toBe(403);
      expect((await response.json()).code).toBe("MFA_SETUP_REQUIRED");
    }
    expect((await f.send("/get-session", undefined, cookie)).status).toBe(200);
    const session = await f.db.session.findFirstOrThrow({
      where: { userId: user.id },
    });
    // Service clock is updated after the real login, never before the session's creation time.
    now = new Date();
    await enroll({ userId: user.id, sessionId: session.id });
    await f.db.session.update({
      where: { id: session.id },
      data: { mfaVerifiedAt: null, mfaMethod: null },
    });
    const response = await f.send(
      "/link-social",
      { provider: "google" },
      cookie,
    );
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("MFA_REQUIRED");
    expect((await f.send("/sign-out", {}, cookie)).status).toBe(200);
  });
});
