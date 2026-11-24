import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authFixture,
  responseCookies,
  testPassword,
  type AuthFixture,
} from "../fixtures/auth";
import { requireUser } from "@/server/auth/require-user";
import { passwordRateKey } from "@/server/auth/rate-limit";

let f: AuthFixture;
beforeEach(() => {
  f = authFixture();
});
afterEach(async () => {
  await f.cleanup();
});

describe("real Better Auth email endpoints", () => {
  it("refuses email registration without an invitation", async () => {
    const email = f.email();
    const response = await f.send("/sign-up/email", {
      email,
      name: "Test",
      password: testPassword,
    });
    expect(response.status).toBe(403);
    expect(await f.db.user.count({ where: { email } })).toBe(0);
  });
  it.each(["expired", "revoked", "accepted"])(
    "refuses a %s invitation",
    async (state) => {
      const { invitation, cookie } = await f.invitation({
        ...(state === "expired"
          ? { expiresAt: new Date(0) }
          : state === "revoked"
            ? { revokedAt: new Date() }
            : { acceptedAt: new Date() }),
      });
      const response = await f.send(
        "/sign-up/email",
        { email: invitation.email, name: "Test", password: testPassword },
        cookie,
      );
      expect(response.ok).toBe(false);
      expect(
        await f.db.user.count({ where: { email: invitation.email } }),
      ).toBe(0);
    },
  );
  it("refuses a different email without consuming the invitation", async () => {
    const { invitation, cookie } = await f.invitation();
    const response = await f.send(
      "/sign-up/email",
      { email: f.email(), name: "Test", password: testPassword },
      cookie,
    );
    expect(response.ok).toBe(false);
    expect((await response.json()).code).toBe("INVITATION_EMAIL_MISMATCH");
    expect(
      (
        await f.db.invitation.findUniqueOrThrow({
          where: { id: invitation.id },
        })
      ).acceptedAt,
    ).toBeNull();
  });
  it("accepts once, normalizes before lookup, owns fields and verifies the invitation email", async () => {
    const { invitation, cookie } = await f.invitation({ role: "TECHNICIAN" });
    const tampered = await f.send(
      "/sign-up/email",
      {
        email: invitation.email,
        name: "Test",
        password: testPassword,
        role: "ADMIN",
        isActive: false,
        mfaEnforced: true,
        employeeId: "attacker",
        lastLoginAt: new Date().toISOString(),
      },
      cookie,
    );
    expect(tampered.status).toBe(400);
    const response = await f.send(
      "/sign-up/email",
      {
        email: `  ${invitation.email.toUpperCase()}  `,
        name: "Test",
        password: testPassword,
      },
      cookie,
    );
    expect(
      response.ok,
      `status=${response.status}, code=${(await response.clone().json()).code}`,
    ).toBe(true);
    const user = await f.db.user.findUniqueOrThrow({
      where: { email: invitation.email },
    });
    expect(user.role).toBe("TECHNICIAN");
    expect(user.isActive).toBe(true);
    expect(user.mfaEnforced).toBe(false);
    expect(user.employeeId).toBeNull();
    expect(user.lastLoginAt).toBeNull();
    expect(user.emailVerified).toBe(true);
    expect(
      (
        await f.db.invitation.findUniqueOrThrow({
          where: { id: invitation.id },
        })
      ).acceptedAt,
    ).not.toBeNull();
    expect(
      await f.db.auditLog.count({
        where: { entityId: invitation.id, action: "INVITATION_ACCEPTED" },
      }),
    ).toBe(1);
    expect(f.messages).toHaveLength(0);
    const login = await f.send("/sign-in/email", {
      email: invitation.email.toUpperCase(),
      password: testPassword,
    });
    expect(login.ok).toBe(true);
    expect(await f.db.user.count({ where: { email: invitation.email } })).toBe(
      1,
    );
    expect(
      await f.db.session.count({
        where: { userId: user.id, mfaVerifiedAt: null, mfaMethod: null },
      }),
    ).toBe(1);
    expect(
      (await f.db.user.findUniqueOrThrow({ where: { id: user.id } }))
        .lastLoginAt,
    ).not.toBeNull();
  });
  it.each([11, 129])(
    "rejects passwords of %i characters without reserving",
    async (length) => {
      const { invitation, cookie } = await f.invitation();
      expect(
        (
          await f.send(
            "/sign-up/email",
            {
              email: invitation.email,
              name: "Test",
              password: "a".repeat(length),
            },
            cookie,
          )
        ).ok,
      ).toBe(false);
      expect(
        (
          await f.db.invitation.findUniqueOrThrow({
            where: { id: invitation.id },
          })
        ).acceptedAt,
      ).toBeNull();
    },
  );
  it("keeps a failed creation reservation consumed, as documented", async () => {
    const { invitation, cookie } = await f.invitation();
    f.failCreation();
    expect(
      (
        await f.send(
          "/sign-up/email",
          { email: invitation.email, name: "Test", password: testPassword },
          cookie,
        )
      ).ok,
    ).toBe(false);
    expect(await f.db.user.count({ where: { email: invitation.email } })).toBe(
      0,
    );
    expect(
      (
        await f.db.invitation.findUniqueOrThrow({
          where: { id: invitation.id },
        })
      ).acceptedAt,
    ).not.toBeNull();
  });
  it("allows at most one concurrent acceptance", async () => {
    const { invitation, cookie } = await f.invitation();
    await Promise.all(
      [1, 2].map(() =>
        f.send(
          "/sign-up/email",
          { email: invitation.email, name: "Test", password: testPassword },
          cookie,
        ),
      ),
    );
    expect(await f.db.user.count({ where: { email: invitation.email } })).toBe(
      1,
    );
    expect(
      await f.db.auditLog.count({
        where: { entityId: invitation.id, action: "INVITATION_ACCEPTED" },
      }),
    ).toBe(1);
  });
  it("rejects an unverified account before the first password session", async () => {
    const user = await f.user();
    await f.db.user.update({
      where: { id: user.id },
      data: { emailVerified: false },
    });
    expect(
      (
        await f.send("/sign-in/email", {
          email: user.email,
          password: testPassword,
        })
      ).ok,
    ).toBe(false);
    expect(await f.db.session.count({ where: { userId: user.id } })).toBe(0);
  });
  it("rejects disabled users on login, existing sessions and protected endpoints", async () => {
    const user = await f.user();
    const login = await f.send("/sign-in/email", {
      email: user.email,
      password: testPassword,
    });
    const cookie = responseCookies(login);
    expect(login.ok).toBe(true);
    await f.db.user.update({
      where: { id: user.id },
      data: { isActive: false },
    });
    expect(
      (
        await f.send("/sign-in/email", {
          email: user.email,
          password: testPassword,
        })
      ).ok,
    ).toBe(false);
    await expect(
      requireUser({
        headers: new Headers({ cookie }),
        db: f.db,
        readSession: (headers) => f.auth.api.getSession({ headers }),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect((await f.send("/update-user", { name: "Changed" }, cookie)).ok).toBe(
      false,
    );
    expect(
      (await f.db.user.findUniqueOrThrow({ where: { id: user.id } })).name,
    ).toBe("Test");
  });
  it("ignores client changes to all server-owned user and session fields", async () => {
    const user = await f.user();
    const cookie = responseCookies(
      await f.send("/sign-in/email", {
        email: user.email,
        password: testPassword,
      }),
    );
    await f.send(
      "/update-user",
      {
        role: "ADMIN",
        isActive: false,
        employeeId: "wrong",
        mfaEnforced: true,
        lastLoginAt: "2000-01-01T00:00:00Z",
        name: "Allowed",
      },
      cookie,
    );
    await f.send(
      "/update-session",
      { mfaVerifiedAt: new Date().toISOString(), mfaMethod: "TOTP" },
      cookie,
    );
    const stored = await f.db.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(stored.role).toBe("EMPLOYEE");
    expect(stored.isActive).toBe(true);
    expect(stored.employeeId).toBeNull();
    expect(stored.mfaEnforced).toBe(false);
    expect(stored.lastLoginAt?.getFullYear()).not.toBe(2000);
    expect(
      await f.db.session.count({
        where: { userId: user.id, mfaVerifiedAt: null, mfaMethod: null },
      }),
    ).toBe(1);
  });
  it("returns the same ordinary error after ten failures for an email and resets on success", async () => {
    const user = await f.user();
    const first = await f.send("/sign-in/email", {
      email: user.email,
      password: "wrong-password",
    });
    expect(first.status).toBe(401);
    const ordinary = await first.json();
    for (let i = 0; i < 9; i++) {
      const request = f.request("/sign-in/email", {
        email: user.email,
        password: "wrong-password",
      });
      request.headers.set("x-real-ip", `198.19.0.${i + 1}`);
      const response = await f.auth.handler(request);
      expect(response.status).toBe(401);
    }
    const blocked = await f.send("/sign-in/email", {
      email: user.email,
      password: testPassword,
    });
    expect(blocked.status).toBe(401);
    expect(await blocked.json()).toEqual(ordinary);
    const rate = await f.db.rateLimit.findUniqueOrThrow({
      where: { key: passwordRateKey(user.email) },
    });
    expect(rate.count).toBe(10);
    expect(rate.key).not.toContain(user.email);
    await f.db.rateLimit.update({
      where: { id: rate.id },
      data: { lastRequest: BigInt(Date.now() - 901_000) },
    });
    expect(
      (
        await f.send("/sign-in/email", {
          email: user.email,
          password: testPassword,
        })
      ).ok,
    ).toBe(true);
    expect(await f.db.rateLimit.count({ where: { key: rate.key } })).toBe(0);
  });
});
