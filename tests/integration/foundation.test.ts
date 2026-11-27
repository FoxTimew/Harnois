import { employeeFixtureFields } from "../fixtures/employees";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authFixture,
  testPassword,
  responseCookies,
  type AuthFixture,
} from "../fixtures/auth";
import { createAuth } from "@/server/auth/config";
import { handleAuthRequest } from "@/server/auth/http";
import type { PrismaClient } from "@/generated/prisma/client";
import type { UserRole } from "@/generated/prisma/client";
import { mutateUser, listUsers, userDetail } from "@/server/services/users";
import { revokeSessions, listSessions } from "@/server/services/sessions";
import {
  auditDetail,
  listAudit,
  exportAudit,
  writeAudit,
} from "@/server/services/audit";
import {
  createInvitation,
  revokeInvitation,
  invitationOverview,
} from "@/server/services/invitations";
import { requireUser } from "@/server/auth/require-user";
import { touchSession } from "@/server/auth/session-activity";
let f: AuthFixture;
beforeEach(() => {
  f = authFixture();
});
afterEach(async () => {
  await f.cleanup();
});
async function identity(role: UserRole = "ADMIN") {
  const user = await f.user(role, false);
  if (role !== "EMPLOYEE")
    await f.db.totpFactor.create({
      data: {
        userId: user.id,
        secretEncrypted: "fixture-not-used-for-verification",
        confirmedAt: new Date(),
      },
    });
  const session = await f.db.session.create({
    data: {
      userId: user.id,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 3600_000),
      mfaVerifiedAt: role === "EMPLOYEE" ? null : new Date(),
    },
  });
  return { user, session, actor: { userId: user.id, sessionId: session.id } };
}
describe("administration and session transactions", () => {
  it("rejects an in-flight login that inserts its session after deactivation", async () => {
    const a = await identity();
    const target = await f.user("EMPLOYEE");
    let entered!: () => void;
    let release!: () => void;
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pausedDb = f.db.$extends({
      query: {
        session: {
          async create({ args, query }) {
            entered();
            await gate;
            return query(args);
          },
        },
      },
    }) as unknown as PrismaClient;
    const auth = createAuth({ db: pausedDb, env: f.env, mail: async () => {} });
    const login = handleAuthRequest(
      f.request("/sign-in/email", {
        email: target.email,
        password: testPassword,
      }),
      auth,
    );
    await reached;
    try {
      await mutateUser(f.db, a.actor, {
        operation: "active",
        userId: target.id,
        isActive: false,
      });
    } finally {
      release();
    }
    const response = await login;
    expect(response.ok).toBe(false);
    expect(await f.db.session.count({ where: { userId: target.id } })).toBe(0);
    await mutateUser(f.db, a.actor, {
      operation: "active",
      userId: target.id,
      isActive: true,
    });
    expect(await f.db.session.count({ where: { userId: target.id } })).toBe(0);
  });
  it("sets activity on login and rejects a client-written activity timestamp", async () => {
    const target = await f.user("EMPLOYEE");
    const response = await f.send("/sign-in/email", {
      email: target.email,
      password: testPassword,
      lastSeenAt: "2999-01-01T00:00:00Z",
    });
    expect(response.ok).toBe(true);
    const session = await f.db.session.findFirstOrThrow({
      where: { userId: target.id },
    });
    expect(session.lastSeenAt).toBeInstanceOf(Date);
    expect(+session.lastSeenAt!).toBeLessThanOrEqual(Date.now());
    const forbidden = await f.send(
      "/update-session",
      { lastSeenAt: "2999-01-01T00:00:00Z" },
      responseCookies(response),
    );
    expect(forbidden.ok).toBe(false);
    expect(
      (await f.db.session.findUniqueOrThrow({ where: { id: session.id } }))
        .lastSeenAt,
    ).toEqual(session.lastSeenAt);
  });
  it.each(["role", "active"] as const)(
    "retains an active administrator during concurrent %s changes",
    async (operation) => {
      const a = await identity();
      const b = await identity();
      const results = await Promise.allSettled([
        mutateUser(f.db, a.actor, {
          operation,
          userId: b.user.id,
          ...(operation === "role"
            ? { role: "EMPLOYEE" }
            : { isActive: false }),
        }),
        mutateUser(f.db, b.actor, {
          operation,
          userId: a.user.id,
          ...(operation === "role"
            ? { role: "EMPLOYEE" }
            : { isActive: false }),
        }),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        await f.db.user.count({
          where: {
            id: { in: [a.user.id, b.user.id] },
            role: "ADMIN",
            isActive: true,
          },
        }),
      ).toBe(1);
      const remaining = await f.db.user.findFirstOrThrow({
        where: {
          id: { in: [a.user.id, b.user.id] },
          role: "ADMIN",
          isActive: true,
        },
      });
      const owner = remaining.id === a.user.id ? a : b;
      await expect(
        mutateUser(f.db, owner.actor, {
          operation,
          userId: remaining.id,
          ...(operation === "role"
            ? { role: "EMPLOYEE" }
            : { isActive: false }),
        }),
      ).rejects.toMatchObject({ code: "SELF_CHANGE_FORBIDDEN" });
    },
  );
  it.each(["role", "active", "revoke-sessions"] as const)(
    "requires fresh proof for %s and refuses self changes",
    async (operation) => {
      const a = await identity();
      const b = await identity("EMPLOYEE");
      const input = {
        operation,
        userId: b.user.id,
        ...(operation === "role"
          ? { role: "TECHNICIAN" }
          : operation === "active"
            ? { isActive: false }
            : {}),
      };
      await f.db.session.update({
        where: { id: a.session.id },
        data: { mfaVerifiedAt: new Date(Date.now() - 601_000) },
      });
      await expect(mutateUser(f.db, a.actor, input)).rejects.toMatchObject({
        code: "REAUTHENTICATION_REQUIRED",
      });
      await f.db.session.update({
        where: { id: a.session.id },
        data: { mfaVerifiedAt: new Date() },
      });
      await expect(
        mutateUser(f.db, a.actor, { ...input, userId: a.user.id }),
      ).rejects.toMatchObject({ code: "SELF_CHANGE_FORBIDDEN" });
    },
  );
  it("deactivation immediately invalidates cookies and reactivation never restores sessions", async () => {
    const a = await identity();
    const b = await identity("EMPLOYEE");
    const readSession = async () => ({ user: b.user, session: b.session });
    await mutateUser(f.db, a.actor, {
      operation: "active",
      userId: b.user.id,
      isActive: false,
    });
    expect(await f.db.session.count({ where: { userId: b.user.id } })).toBe(0);
    await expect(
      requireUser({ db: f.db, readSession, headers: new Headers() }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await f.db.session.update({
      where: { id: a.session.id },
      data: { mfaVerifiedAt: new Date(Date.now() - 601_000) },
    });
    await expect(
      mutateUser(f.db, a.actor, {
        operation: "active",
        userId: b.user.id,
        isActive: true,
      }),
    ).rejects.toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
    await f.db.session.update({
      where: { id: a.session.id },
      data: { mfaVerifiedAt: new Date() },
    });
    await mutateUser(f.db, a.actor, {
      operation: "active",
      userId: b.user.id,
      isActive: true,
    });
    expect(await f.db.session.count({ where: { userId: b.user.id } })).toBe(0);
    expect(
      await f.db.auditLog.count({
        where: { action: "USER_STATUS_CHANGED", entityId: b.user.id },
      }),
    ).toBe(2);
  });
  it("ADMIN can revoke all other-user sessions without disabling or revealing tokens", async () => {
    const a = await identity();
    const b = await identity("EMPLOYEE");
    const rows = await listSessions(f.db, a.actor, b.user.id);
    expect(JSON.stringify(rows)).not.toContain(b.session.token);
    expect(Object.keys(rows[0])).not.toContain("userAgent");
    await mutateUser(f.db, a.actor, {
      operation: "revoke-sessions",
      userId: b.user.id,
    });
    expect(
      (await f.db.user.findUniqueOrThrow({ where: { id: b.user.id } }))
        .isActive,
    ).toBe(true);
    expect(await f.db.session.count({ where: { userId: b.user.id } })).toBe(0);
    expect(
      (
        await f.db.auditLog.findFirstOrThrow({
          where: { action: "USER_SESSIONS_REVOKED", entityId: b.user.id },
        })
      ).changes,
    ).toEqual({ count: 1 });
  });
  it.each(["IT_MANAGER", "TECHNICIAN", "EMPLOYEE"] as const)(
    "%s cannot access users or revoke other-user sessions",
    async (role) => {
      const a = await identity(role);
      const b = await identity("EMPLOYEE");
      await expect(listUsers(f.db, a.actor, {})).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(userDetail(f.db, a.actor, b.user.id)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        listSessions(f.db, a.actor, b.user.id),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        mutateUser(f.db, a.actor, {
          operation: "revoke-sessions",
          userId: b.user.id,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        requireUser({
          db: f.db,
          readSession: async () => ({ user: a.user, session: a.session }),
          headers: new Headers(),
          permission: { action: "read", resource: "users" },
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );
  it("personal revocations require fresh proof, are owner-scoped, and audit all-others", async () => {
    const a = await identity("EMPLOYEE");
    const b = await identity("EMPLOYEE");
    await expect(
      revokeSessions(f.db, a.actor, {
        operation: "one",
        sessionId: b.session.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const other = await f.db.session.create({
      data: {
        userId: a.user.id,
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    await f.db.session.update({
      where: { id: a.session.id },
      data: { createdAt: new Date(Date.now() - 601_000) },
    });
    await expect(
      revokeSessions(f.db, a.actor, { operation: "others" }),
    ).rejects.toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
    await f.db.session.update({
      where: { id: a.session.id },
      data: { createdAt: new Date() },
    });
    await revokeSessions(f.db, a.actor, { operation: "others" });
    expect(
      await f.db.session.findUnique({ where: { id: other.id } }),
    ).toBeNull();
    expect(
      await f.db.session.count({
        where: { id: { in: [a.session.id, b.session.id] } },
      }),
    ).toBe(2);
    expect(
      (
        await revokeSessions(f.db, a.actor, {
          operation: "one",
          sessionId: a.session.id,
        })
      ).currentRevoked,
    ).toBe(true);
    expect(
      await f.db.auditLog.count({
        where: { userId: a.user.id, action: "SESSIONS_REVOKED" },
      }),
    ).toBe(2);
  });
  it("throttles concurrent activity writes without renewal, audit, or resurrection", async () => {
    const a = await identity("EMPLOYEE");
    const now = new Date();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => touchSession(f.db, a.session.id, now)),
    );
    expect(results.reduce((sum, result) => sum + result.count, 0)).toBe(1);
    expect(
      (await touchSession(f.db, a.session.id, new Date(+now + 59_999))).count,
    ).toBe(0);
    expect(
      (await touchSession(f.db, a.session.id, new Date(+now + 60_000))).count,
    ).toBe(1);
    expect(
      (await f.db.session.findUniqueOrThrow({ where: { id: a.session.id } }))
        .expiresAt,
    ).toEqual(a.session.expiresAt);
    expect(await f.db.auditLog.count({ where: { userId: a.user.id } })).toBe(0);
    await f.db.session.delete({ where: { id: a.session.id } });
    expect((await touchSession(f.db, a.session.id)).count).toBe(0);
  });
  it("links an employee once, audits before/after, and prevents a concurrent duplicate link", async () => {
    const a = await identity();
    const b = await identity("EMPLOYEE");
    const employee = await f.db.employee.create({
      data: employeeFixtureFields(f.email()),
    });
    const results = await Promise.allSettled(
      [a.user.id, b.user.id].map((userId) =>
        mutateUser(f.db, a.actor, {
          operation: "employee",
          userId,
          employeeId: employee.id,
        }),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(await f.db.user.count({ where: { employeeId: employee.id } })).toBe(
      1,
    );
    const audit = await f.db.auditLog.findFirstOrThrow({
      where: { userId: a.user.id, action: "USER_EMPLOYEE_CHANGED" },
    });
    expect(audit.changes).toEqual({
      before: { employeeId: null },
      after: { employeeId: employee.id },
    });
  });
  it("filters and paginates user DTOs without exposing tokens or factors", async () => {
    const a = await identity();
    const b = await identity("EMPLOYEE");
    const result = await listUsers(f.db, a.actor, {
      q: b.user.email,
      role: "EMPLOYEE",
      active: "true",
      sort: "email",
    });
    expect(result.total).toBe(1);
    expect(result.rows[0].id).toBe(b.user.id);
    expect(JSON.stringify(result)).not.toMatch(
      /secretEncrypted|token|password/,
    );
  });
});
describe("invitation role boundaries", () => {
  it.each(["ADMIN", "IT_MANAGER"] as const)(
    "manager cannot replace, revoke or list %s invitations",
    async (role) => {
      const a = await identity("IT_MANAGER");
      const { invitation } = await f.invitation({
        role,
        expiresAt: new Date(0),
      });
      await expect(
        createInvitation(
          f.db,
          a.user.id,
          { email: invitation.email, role: "EMPLOYEE" },
          a.session.id,
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        revokeInvitation(f.db, a.user.id, invitation.id, a.session.id),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(
        (
          await f.db.invitation.findUniqueOrThrow({
            where: { id: invitation.id },
          })
        ).revokedAt,
      ).toBeNull();
      expect((await invitationOverview(f.db, a.user.id)).invitations).toEqual(
        [],
      );
    },
  );
  it("manager invites lower roles, replacing expired invitations in one transaction", async () => {
    const a = await identity("IT_MANAGER");
    const { invitation } = await f.invitation({ expiresAt: new Date(0) });
    await createInvitation(
      f.db,
      a.user.id,
      { email: invitation.email, role: "TECHNICIAN" },
      a.session.id,
    );
    expect(
      (
        await f.db.invitation.findUniqueOrThrow({
          where: { id: invitation.id },
        })
      ).revokedAt,
    ).not.toBeNull();
    expect((await invitationOverview(f.db, a.user.id)).allowedRoles).toEqual([
      "TECHNICIAN",
      "EMPLOYEE",
    ]);
  });
});
describe("audit isolation and exports", () => {
  it("IT_MANAGER sees business events only in count, list, detail and CSV, including forged filters", async () => {
    const a = await identity("IT_MANAGER");
    const business = await writeAudit(f.db, {
      action: "EQUIPMENT_UPDATED",
      userId: a.user.id,
      entityType: "Equipment",
    });
    const secret = await writeAudit(f.db, {
      action: "MFA_VERIFIED",
      userId: a.user.id,
      entityType: "Mfa",
      method: "TOTP",
    });
    const unknown = await f.db.auditLog.create({
      data: {
        userId: a.user.id,
        action: "UNKNOWN_NEW_EVENT",
        entityType: "User",
        entityId: a.user.id,
      },
    });
    expect((await listAudit(f.db, a.actor, { userId: a.user.id })).total).toBe(
      1,
    );
    expect((await auditDetail(f.db, a.actor, business.id)).id).toBe(
      business.id,
    );
    for (const id of [secret.id, unknown.id])
      await expect(auditDetail(f.db, a.actor, id)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    expect(
      (
        await listAudit(f.db, a.actor, {
          action: "MFA_VERIFIED",
          userId: a.user.id,
        })
      ).total,
    ).toBe(0);
    const csv = await exportAudit(f.db, a.actor, { userId: a.user.id });
    expect(csv).toContain("EQUIPMENT_UPDATED");
    expect(csv).not.toMatch(/MFA_VERIFIED|UNKNOWN_NEW_EVENT|AUDIT_EXPORTED/);
    const logged = await f.db.auditLog.findFirstOrThrow({
      where: { userId: a.user.id, action: "AUDIT_EXPORTED" },
    });
    expect(logged.createdAt).toBeInstanceOf(Date);
    expect(logged.changes).toEqual({
      count: 1,
      filters: { userId: a.user.id, sort: "createdAt", order: "desc" },
    });
    expect((await listAudit(f.db, a.actor, { userId: a.user.id })).total).toBe(
      1,
    );
  });
  it.each(["TECHNICIAN", "EMPLOYEE"] as const)(
    "refuses every audit service to %s",
    async (role) => {
      const a = await identity(role);
      await Promise.all(
        [
          listAudit(f.db, a.actor, {}),
          auditDetail(f.db, a.actor, "missing"),
          exportAudit(f.db, a.actor, {}),
        ].map((operation) =>
          expect(operation).rejects.toMatchObject({ code: "FORBIDDEN" }),
        ),
      );
    },
  );
  it("cleans legacy secrets at every read and ignores extra fields at write", async () => {
    const a = await identity();
    const row = await f.db.auditLog.create({
      data: {
        userId: a.user.id,
        action: "USER_ROLE_CHANGED",
        entityType: "User",
        entityId: a.user.id,
        changes: {
          before: { passwordHash: "NEVER_EXPORT", role: "EMPLOYEE" },
          after: [{ encrypted_secret: "NEVER_EXPORT", role: "ADMIN" }],
        },
      },
    });
    expect(
      JSON.stringify(await auditDetail(f.db, a.actor, row.id)),
    ).not.toContain("NEVER_EXPORT");
    expect(
      JSON.stringify(await listAudit(f.db, a.actor, { userId: a.user.id })),
    ).not.toContain("NEVER_EXPORT");
    expect(
      await exportAudit(f.db, a.actor, { userId: a.user.id }),
    ).not.toContain("NEVER_EXPORT");
    const written = await writeAudit(f.db, {
      action: "USER_STATUS_CHANGED",
      userId: a.user.id,
      entityType: "User",
      changes: {
        before: { isActive: true, email: "private" },
        after: { isActive: false, password: "private" },
        arbitrary: "private",
      },
    });
    expect(written.changes).toEqual({
      before: { isActive: true },
      after: { isActive: false },
    });
  });
  it("refuses exports over 10000 rows without truncation or successful-export audit", async () => {
    const a = await identity();
    const ids = Array.from({ length: 10_001 }, () => randomUUID());
    f.records.set("AuditLog", new Set(ids));
    await f.db.auditLog.createMany({
      data: ids.map((id) => ({
        id,
        userId: a.user.id,
        action: "EQUIPMENT_CREATED",
        entityType: "Equipment",
        entityId: id,
      })),
    });
    await expect(
      exportAudit(f.db, a.actor, { userId: a.user.id }),
    ).rejects.toMatchObject({ code: "EXPORT_TOO_LARGE" });
    expect(
      await f.db.auditLog.count({
        where: { userId: a.user.id, action: "AUDIT_EXPORTED" },
      }),
    ).toBe(0);
    await f.db.auditLog.delete({ where: { id: ids[0] } });
    const csv = await exportAudit(f.db, a.actor, {
      userId: a.user.id,
      page: 300,
      pageSize: 10,
    });
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(10_001);
  }, 30_000);
});
