import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authFixture,
  responseCookies,
  testPassword,
  type AuthFixture,
} from "../fixtures/auth";

let f: AuthFixture;
beforeEach(() => {
  f = authFixture();
});
afterEach(async () => {
  await f.cleanup();
});
describe("email verification and password recovery", () => {
  it("uses neutral responses for existing and missing addresses", async () => {
    const user = await f.user();
    const known = await f.send("/request-password-reset", {
      email: user.email,
      redirectTo: "/reset-password",
    });
    const missing = await f.send("/request-password-reset", {
      email: f.email(),
      redirectTo: "/reset-password",
    });
    expect(known.status).toBe(missing.status);
    expect(await known.json()).toEqual(await missing.json());
    expect(f.messages).toHaveLength(1);
  });
  it("resets once, revokes sessions and writes a safe audit", async () => {
    const user = await f.user();
    const cookie = responseCookies(
      await f.send("/sign-in/email", {
        email: user.email,
        password: testPassword,
      }),
    );
    await f.send("/request-password-reset", {
      email: user.email.toUpperCase(),
      redirectTo: "/reset-password",
    });
    const token = new URL(f.messages[0].url).pathname.split("/").at(-1)!;
    const changed = "Different-valid-password-42";
    expect(
      (await f.send("/reset-password", { token, newPassword: changed })).ok,
    ).toBe(true);
    expect(
      (await f.send("/reset-password", { token, newPassword: changed })).ok,
    ).toBe(false);
    expect(await f.db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(
      await (await f.send("/get-session", undefined, cookie)).json(),
    ).toBeNull();
    expect(
      (
        await f.send("/sign-in/email", {
          email: user.email,
          password: testPassword,
        })
      ).ok,
    ).toBe(false);
    expect(
      (await f.send("/sign-in/email", { email: user.email, password: changed }))
        .ok,
    ).toBe(true);
    const audits = await f.db.auditLog.findMany({ where: { userId: user.id } });
    expect(
      audits.filter((entry) => entry.action === "PASSWORD_RESET"),
    ).toHaveLength(1);
    const serialized = JSON.stringify(audits);
    for (const forbidden of [token, changed, testPassword, user.email])
      expect(serialized.includes(forbidden)).toBe(false);
  });
  it("verifies an email without automatically opening a session", async () => {
    const user = await f.user();
    await f.db.user.update({
      where: { id: user.id },
      data: { emailVerified: false },
    });
    expect(
      (
        await f.send("/send-verification-email", {
          email: user.email,
          callbackURL: "/verify-email",
        })
      ).ok,
    ).toBe(true);
    const token = new URL(f.messages[0].url).searchParams.get("token")!;
    const result = await f.send(
      `/verify-email?token=${encodeURIComponent(token)}&callbackURL=/verify-email`,
    );
    expect(result.status).toBe(302);
    expect(
      (await f.db.user.findUniqueOrThrow({ where: { id: user.id } }))
        .emailVerified,
    ).toBe(true);
    expect(await f.db.session.count({ where: { userId: user.id } })).toBe(0);
  });
  it("invalidates logout immediately in PostgreSQL", async () => {
    const user = await f.user();
    const cookie = responseCookies(
      await f.send("/sign-in/email", {
        email: user.email,
        password: testPassword,
      }),
    );
    expect((await f.send("/sign-out", {}, cookie)).ok).toBe(true);
    expect(await f.db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(
      await (await f.send("/get-session", undefined, cookie)).json(),
    ).toBeNull();
  });
});
