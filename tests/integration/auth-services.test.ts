import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authFixture,
  responseCookies,
  testPassword,
  type AuthFixture,
} from "../fixtures/auth";
import {
  createBootstrapInvitation,
  createInvitation,
  reserveInvitation,
  revokeInvitation,
} from "@/server/services/invitations";
import { consumeRateLimit, privateRateKey } from "@/server/auth/rate-limit";
import { requireUser } from "@/server/auth/require-user";
import { prepareInvitation } from "@/server/auth/prepare-invitation";

let f: AuthFixture;
beforeEach(() => {
  f = authFixture();
});
afterEach(async () => {
  await f.cleanup();
});
describe("invitation and account services", () => {
  it.each(["EMPLOYEE", "TECHNICIAN", "IT_MANAGER"] as const)(
    "refuses invitation creation and admin access for %s",
    async (role) => {
      const user = await f.user(role);
      const cookie = responseCookies(
        await f.send("/sign-in/email", {
          email: user.email,
          password: testPassword,
        }),
      );
      await expect(
        createInvitation(f.db, user.id, { email: f.email(), role: "ADMIN" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        requireUser({
          db: f.db,
          headers: new Headers({ cookie }),
          readSession: (headers) => f.auth.api.getSession({ headers }),
          roles: ["ADMIN"],
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );
  it("revokes even an expired pending invitation and refuses existing users", async () => {
    const admin = await f.user("ADMIN");
    const { invitation } = await f.invitation({ expiresAt: new Date(0) });
    const created = await createInvitation(f.db, admin.id, {
      email: ` ${invitation.email.toUpperCase()} `,
      role: "TECHNICIAN",
    });
    expect(created.token).toHaveLength(43);
    expect(created.invitation.tokenHash).not.toBe(created.token);
    expect(
      (
        await f.db.invitation.findUniqueOrThrow({
          where: { id: invitation.id },
        })
      ).revokedAt,
    ).not.toBeNull();
    expect(
      await f.db.auditLog.count({
        where: { entityId: invitation.id, action: "INVITATION_REVOKED" },
      }),
    ).toBe(1);
    await expect(
      createInvitation(f.db, admin.id, { email: admin.email, role: "ADMIN" }),
    ).rejects.toMatchObject({ code: "USER_ALREADY_EXISTS" });
  });
  it("serializes concurrent invitation creation and preserves the previous history", async () => {
    const admin = await f.user("ADMIN");
    const email = f.email();
    await Promise.all(
      [1, 2].map(() =>
        createInvitation(f.db, admin.id, { email, role: "EMPLOYEE" }),
      ),
    );
    expect(await f.db.invitation.count({ where: { email } })).toBe(2);
    expect(
      await f.db.invitation.count({
        where: { email, revokedAt: null, acceptedAt: null },
      }),
    ).toBe(1);
  });
  it("applies the employee and rejects an already-linked employee before reservation", async () => {
    const employee = await f.db.employee.create({
      data: { firstName: "Test", lastName: "Test", email: f.email() },
    });
    const { invitation } = await f.invitation({ employeeId: employee.id });
    const user = await f.user();
    await f.db.user.update({
      where: { id: user.id },
      data: { employeeId: employee.id },
    });
    await expect(
      reserveInvitation(f.db, invitation.id, invitation.email),
    ).rejects.toMatchObject({ code: "EMPLOYEE_ALREADY_LINKED" });
    expect(
      (
        await f.db.invitation.findUniqueOrThrow({
          where: { id: invitation.id },
        })
      ).acceptedAt,
    ).toBeNull();
  });
  it("recovers a consumed reservation by revoking and reinviting", async () => {
    const admin = await f.user("ADMIN");
    const { invitation } = await f.invitation();
    await reserveInvitation(f.db, invitation.id, invitation.email);
    await revokeInvitation(f.db, admin.id, invitation.id);
    const next = await createInvitation(f.db, admin.id, {
      email: invitation.email,
      role: "EMPLOYEE",
    });
    expect(next.invitation.id).not.toBe(invitation.id);
    expect(next.invitation.acceptedAt).toBeNull();
    expect(
      (
        await f.db.invitation.findUniqueOrThrow({
          where: { id: invitation.id },
        })
      ).revokedAt,
    ).not.toBeNull();
  });
  it("refuses bootstrap after any administrator exists", async () => {
    await f.user("ADMIN", false);
    await expect(
      createBootstrapInvitation(f.db, f.email()),
    ).rejects.toMatchObject({ code: "ADMIN_ALREADY_EXISTS" });
  });
  it("refuses cross-origin invitation preparation", async () => {
    const { token } = await f.invitation();
    const response = await prepareInvitation(
      new Request(`${f.env.BETTER_AUTH_URL}/api/invitations/prepare`, {
        method: "POST",
        headers: {
          origin: "https://untrusted.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ token }),
      }),
      f.db,
      f.env,
    );
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });
  it("atomically limits parallel requests", async () => {
    const key = privateRateKey("invitation-prepare", f.ip);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => consumeRateLimit(f.db, key, 10, 900)),
    );
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(
      (await f.db.rateLimit.findUniqueOrThrow({ where: { key } })).count,
    ).toBe(10);
  });
  it("cannot unlink the last method, including concurrent attempts", async () => {
    const user = await f.user();
    const cookie = responseCookies(
      await f.send("/sign-in/email", {
        email: user.email,
        password: testPassword,
      }),
    );
    const account = await f.db.account.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(
      (await f.send("/unlink-account", { accountId: account.id }, cookie)).ok,
    ).toBe(false);
    const google = await f.db.account.create({
      data: { userId: user.id, providerId: "google", accountId: f.email() },
    });
    const responses = await Promise.all(
      [account.id, google.id].map((accountId) =>
        f.send("/unlink-account", { accountId }, cookie),
      ),
    );
    expect(responses.filter((response) => response.ok)).toHaveLength(1);
    expect(await f.db.account.count({ where: { userId: user.id } })).toBe(1);
    expect(
      await f.db.auditLog.count({
        where: { userId: user.id, action: "PROVIDER_UNLINKED" },
      }),
    ).toBe(1);
  });
  it("does not unlink another user's account", async () => {
    const owner = await f.user();
    const attacker = await f.user();
    const cookie = responseCookies(
      await f.send("/sign-in/email", {
        email: attacker.email,
        password: testPassword,
      }),
    );
    const account = await f.db.account.findFirstOrThrow({
      where: { userId: owner.id },
    });
    expect(
      (await f.send("/unlink-account", { accountId: account.id }, cookie)).ok,
    ).toBe(false);
    expect(await f.db.account.count({ where: { id: account.id } })).toBe(1);
  });
  it("expires sessions and never caches disabled users in cookies", async () => {
    const user = await f.user();
    const login = await f.send("/sign-in/email", {
      email: user.email,
      password: testPassword,
    });
    expect(
      login.headers
        .getSetCookie()
        .some((cookie) => cookie.includes("session_data")),
    ).toBe(false);
    const cookie = responseCookies(login);
    const stored = await f.db.session.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      6.99 * 86400_000,
    );
    await f.db.session.update({
      where: { id: stored.id },
      data: { expiresAt: new Date(0) },
    });
    await expect(
      requireUser({
        db: f.db,
        headers: new Headers({ cookie }),
        readSession: (headers) => f.auth.api.getSession({ headers }),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
