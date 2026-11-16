import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authFixture,
  responseCookies,
  testPassword,
  type AuthFixture,
} from "../fixtures/auth";
import { createAuth } from "@/server/auth/config";
import { handleAuthRequest } from "@/server/auth/http";
let f: AuthFixture;
beforeEach(() => {
  f = authFixture();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await f.cleanup();
});
describe("authentication security boundaries", () => {
  it.each([
    { role: "ADMIN" },
    { isActive: false },
    { employeeId: "attacker" },
    { mfaEnforced: true },
    { lastLoginAt: new Date(0).toISOString() },
  ])("rejects each server-owned user field: %j", async (field) => {
    const { invitation, cookie } = await f.invitation();
    const signup = await f.send(
      "/sign-up/email",
      {
        email: invitation.email,
        name: "Test",
        password: testPassword,
        ...field,
      },
      cookie,
    );
    expect(signup.ok).toBe(false);
    expect(await f.db.user.count({ where: { email: invitation.email } })).toBe(
      0,
    );
    const user = await f.user();
    const sessionCookie = responseCookies(
      await f.send("/sign-in/email", {
        email: user.email,
        password: testPassword,
      }),
    );
    expect(
      (await f.send("/update-user", { name: "Test", ...field }, sessionCookie))
        .ok,
    ).toBe(false);
    expect(
      (await f.db.user.findUniqueOrThrow({ where: { id: user.id } })).role,
    ).toBe("EMPLOYEE");
  });
  it("applies the invited employee at user creation", async () => {
    const employee = await f.db.employee.create({
      data: { firstName: "Test", lastName: "Test", email: f.email() },
    });
    const { invitation, cookie } = await f.invitation({
      employeeId: employee.id,
    });
    expect(
      (
        await f.send(
          "/sign-up/email",
          { email: invitation.email, name: "Test", password: testPassword },
          cookie,
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await f.db.user.findUniqueOrThrow({
          where: { email: invitation.email },
        })
      ).employeeId,
    ).toBe(employee.id);
  });
  it("limits native HTTP requests by X-Real-IP, independent of email", async () => {
    for (let i = 0; i < 10; i++)
      expect(
        (
          await f.send("/sign-in/email", {
            email: f.email(),
            password: testPassword,
          })
        ).status,
      ).toBe(401);
    expect(
      (
        await f.send("/sign-in/email", {
          email: f.email(),
          password: testPassword,
        })
      ).status,
    ).toBe(429);
  });
  it("renews after 24 hours without changing lastLoginAt", async () => {
    const user = await f.user();
    const cookie = responseCookies(
      await f.send("/sign-in/email", {
        email: user.email,
        password: testPassword,
      }),
    );
    const before = await f.db.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    await f.db.session.updateMany({
      where: { userId: user.id },
      data: {
        expiresAt: new Date(Date.now() + 5 * 86400_000),
        updatedAt: new Date(Date.now() - 2 * 86400_000),
      },
    });
    expect((await f.send("/get-session", undefined, cookie)).ok).toBe(true);
    const session = await f.db.session.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(session.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      6.99 * 86400_000,
    );
    expect(
      (await f.db.user.findUniqueOrThrow({ where: { id: user.id } }))
        .lastLoginAt,
    ).toEqual(before.lastLoginAt);
  });
  it("requires a fresh session for linking and unlinking", async () => {
    const user = await f.user();
    const cookie = responseCookies(
      await f.send("/sign-in/email", {
        email: user.email,
        password: testPassword,
      }),
    );
    await f.db.session.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date(Date.now() - 301_000) },
    });
    expect(
      (await f.send("/link-social", { provider: "microsoft" }, cookie)).status,
    ).toBe(401);
    expect(
      (await f.send("/unlink-account", { accountId: "any" }, cookie)).status,
    ).toBe(401);
  });
  it("starts with only four variables and refuses missing SMTP without leaking account existence", async () => {
    const auth = createAuth({ db: f.db, env: f.env });
    const user = await f.user();
    for (const email of [user.email, f.email()]) {
      const result = await handleAuthRequest(
        f.request("/request-password-reset", { email }),
        auth,
      );
      expect(result.status).toBe(503);
      expect((await result.json()).code).toBe("EMAIL_TRANSPORT_UNAVAILABLE");
    }
  });
  it("does not log emails, passwords or invitation tokens on failed creation", async () => {
    const output: unknown[][] = [];
    for (const method of ["log", "error", "warn", "info", "debug"] as const)
      vi.spyOn(console, method).mockImplementation((...args) => {
        output.push(args);
      });
    const { invitation, cookie, token } = await f.invitation();
    f.failCreation();
    await f.send(
      "/sign-up/email",
      { email: invitation.email, name: "Test", password: testPassword },
      cookie,
    );
    const logs = JSON.stringify(output);
    for (const value of [invitation.email, testPassword, token, cookie])
      expect(logs.includes(value)).toBe(false);
  });
});
