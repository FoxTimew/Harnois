import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import type { UserRole } from "@/generated/prisma/client";
import type { EmployeeFields } from "@/lib/employee-validation";
import { authFixture, type AuthFixture } from "../fixtures/auth";
import {
  mutateEmployee,
  employeeDetail,
  listEmployees,
  employeeOptions,
  employeeFields,
  exportEmployees,
  departedActiveAccounts,
} from "@/server/services/employees";
import { mutateReference, listReferences } from "@/server/services/references";
import { mutateUser } from "@/server/services/users";
import {
  previewEmployeeImport,
  confirmEmployeeImport,
} from "@/server/services/employee-import";
import { employeeSearchText } from "@/server/services/employee-invariants";
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
        secretEncrypted: "fixture",
        confirmedAt: new Date(),
      },
    });
  const session = await f.db.session.create({
    data: {
      userId: user.id,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 3600_000),
      mfaVerifiedAt: role !== "EMPLOYEE" ? new Date() : null,
    },
  });
  return { user, session, actor: { userId: user.id, sessionId: session.id } };
}
const fields = (overrides: Partial<EmployeeFields> = {}): EmployeeFields => ({
  email: f.email(),
  firstName: "Céline",
  lastName: "Lefèvre",
  phone: null,
  jobTitle: null,
  status: "ACTIVE",
  startDate: null,
  endDate: null,
  organizationId: null,
  departmentId: null,
  locationId: null,
  managerId: null,
  ...overrides,
});
async function employee(overrides: Partial<EmployeeFields> = {}) {
  const value = fields(overrides);
  return f.db.employee.create({
    data: {
      ...value,
      searchText: employeeSearchText(value),
      startDate: value.startDate ? new Date(value.startDate) : null,
      endDate: value.endDate ? new Date(value.endDate) : null,
    },
  });
}
async function update(
  actor: Awaited<ReturnType<typeof identity>>["actor"],
  id: string,
  changes: Partial<EmployeeFields>,
  options = {},
) {
  const row = await f.db.employee.findUniqueOrThrow({ where: { id } });
  return mutateEmployee(f.db, actor, {
    id,
    updatedAt: row.updatedAt.toISOString(),
    fields: { ...employeeFields(row), ...changes },
    ...options,
  });
}
const file = (lines: string[], header = "email;prenom;nom;statut") =>
  Buffer.from(header + "\n" + lines.join("\n"));
async function importFile(
  actor: Awaited<ReturnType<typeof identity>>["actor"],
  bytes: Buffer,
  options = {},
) {
  const preview = await previewEmployeeImport(f.db, actor, bytes);
  const result = await confirmEmployeeImport(f.db, actor, bytes, {
    previewId: preview.previewId,
    options: preview.options,
    approvedReferences: preview.references.map((ref) => ref.id),
    ...options,
  });
  return { preview, result };
}
describe("employee boundaries and state transitions", () => {
  it("lets EMPLOYEE read only the linked record and denies every list/lookup/export/write", async () => {
    const a = await identity("EMPLOYEE"),
      own = await employee(),
      other = await employee();
    await f.db.user.update({
      where: { id: a.user.id },
      data: { employeeId: own.id },
    });
    expect((await employeeDetail(f.db, a.actor, own.id)).id).toBe(own.id);
    for (const operation of [
      () => employeeDetail(f.db, a.actor, other.id),
      () => listEmployees(f.db, a.actor, {}),
      () => employeeOptions(f.db, a.actor),
      () => exportEmployees(f.db, a.actor, {}),
      () => mutateEmployee(f.db, a.actor, { fields: fields() }),
      () => listReferences(f.db, a.actor, "locations"),
    ])
      await expect(operation()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("TECHNICIAN receives no phone, dates, searchText or user security data and cannot write", async () => {
    const a = await identity("TECHNICIAN"),
      row = await employee({
        phone: "+33612345678",
        startDate: "2026-01-01",
        endDate: "2026-12-01",
      });
    const detail = await employeeDetail(f.db, a.actor, row.id);
    for (const key of ["phone", "startDate", "endDate", "searchText", "user"])
      expect(detail).not.toHaveProperty(key);
    const list = await listEmployees(f.db, a.actor, {});
    expect(list.rows.find((item) => item.id === row.id)).not.toHaveProperty(
      "phone",
    );
    await expect(
      update(a.actor, row.id, { firstName: "Autre" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(exportEmployees(f.db, a.actor, {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("finds accent/case variants, content fragments and updated emails", async () => {
    const a = await identity(),
      row = await employee();
    for (const q of ["celine", "CÉLINE", "lefevre", "fevre"])
      expect(
        (await listEmployees(f.db, a.actor, { q })).rows.some(
          (item) => item.id === row.id,
        ),
      ).toBe(true);
    await update(a.actor, row.id, {
      firstName: "Élodie",
      email: " ELODIE@EXAMPLE.INVALID ",
    });
    expect(
      (await listEmployees(f.db, a.actor, { q: "elodie@example.invalid" }))
        .rows[0].id,
    ).toBe(row.id);
    expect((await listEmployees(f.db, a.actor, { q: "%" })).total).toBe(0);
  });
  it("rejects browser searchText, stale edits and normalized duplicate emails", async () => {
    const a = await identity(),
      row = await employee();
    await expect(
      mutateEmployee(f.db, a.actor, {
        fields: { ...fields(), searchText: "tamper" },
      }),
    ).rejects.toThrow();
    await expect(
      mutateEmployee(f.db, a.actor, {
        id: row.id,
        updatedAt: "2000-01-01T00:00:00Z",
        fields: employeeFields(row),
      }),
    ).rejects.toMatchObject({ code: "STALE_RECORD" });
    await expect(
      mutateEmployee(f.db, a.actor, {
        fields: fields({ email: " " + row.email.toUpperCase() + " " }),
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_EMPLOYEE_EMAIL" });
  });
  it("derives organization from department and rejects explicit mismatches", async () => {
    const a = await identity(),
      org = await f.db.organization.create({ data: { name: randomUUID() } }),
      other = await f.db.organization.create({ data: { name: randomUUID() } });
    const dept = await f.db.department.create({
      data: { name: "Support", organizationId: org.id },
    });
    const created = await mutateEmployee(f.db, a.actor, {
      fields: fields({ departmentId: dept.id }),
    });
    expect(
      (await f.db.employee.findUniqueOrThrow({ where: { id: created.id } }))
        .organizationId,
    ).toBe(org.id);
    await expect(
      update(a.actor, created.id, { organizationId: other.id }),
    ).rejects.toMatchObject({ code: "ORGANIZATION_MISMATCH" });
  });
  it("rejects three-level cycles and simultaneous opposing management edits", async () => {
    const a = await identity(),
      top = await employee(),
      middle = await employee({ managerId: top.id }),
      bottom = await employee({ managerId: middle.id });
    await expect(
      update(a.actor, top.id, { managerId: bottom.id }),
    ).rejects.toMatchObject({ code: "HIERARCHY_CYCLE" });
    const x = await employee(),
      y = await employee();
    const results = await Promise.allSettled([
      update(a.actor, x.id, { managerId: y.id }),
      update(a.actor, y.id, { managerId: x.id }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === "rejected"),
    ).toMatchObject({ reason: { code: "HIERARCHY_CYCLE" } });
  });
  it("blocks a departing manager until nondeparted reports are reassigned", async () => {
    const a = await identity(),
      manager = await employee(),
      report = await employee({ managerId: manager.id });
    await expect(
      update(
        a.actor,
        manager.id,
        { status: "LEFT", endDate: "2026-01-01" },
        { immediateDepartureConfirmed: true },
      ),
    ).rejects.toMatchObject({ code: "MANAGER_HAS_REPORTS" });
    await update(a.actor, report.id, { managerId: null });
    await update(
      a.actor,
      manager.id,
      { status: "LEFT", endDate: "2026-01-01" },
      { immediateDepartureConfirmed: true },
    );
    await expect(
      update(a.actor, report.id, { managerId: manager.id }),
    ).rejects.toMatchObject({ code: "MANAGER_LEFT" });
  });
  it.each(["ADMIN", "IT_MANAGER"] as const)(
    "%s can confirm immediate departure with a nonfuture date",
    async (role) => {
      const a = await identity(role),
        row = await employee();
      await expect(
        update(a.actor, row.id, { status: "LEFT", endDate: "2026-01-01" }),
      ).rejects.toMatchObject({
        code: "IMMEDIATE_DEPARTURE_CONFIRMATION_REQUIRED",
      });
      await expect(
        update(
          a.actor,
          row.id,
          { status: "LEFT", endDate: "2999-01-01" },
          { immediateDepartureConfirmed: true },
        ),
      ).rejects.toMatchObject({ code: "DEPARTURE_DATE_REQUIRED" });
      await update(
        a.actor,
        row.id,
        { status: "LEFT", endDate: "2026-01-01" },
        { immediateDepartureConfirmed: true },
      );
      expect(
        await f.db.auditLog.count({
          where: { entityId: row.id, action: "EMPLOYEE_IMMEDIATE_DEPARTURE" },
        }),
      ).toBe(1);
      await expect(
        update(a.actor, row.id, { status: "ACTIVE" }),
      ).rejects.toMatchObject({ code: "INVALID_STATUS_TRANSITION" });
    },
  );
  it("requires ADMIN and fresh proof for reentry, preserving disabled accounts", async () => {
    const admin = await identity(),
      manager = await identity("IT_MANAGER"),
      row = await employee({ status: "LEFT", endDate: "2026-01-01" }),
      user = await f.user();
    await f.db.user.update({
      where: { id: user.id },
      data: { employeeId: row.id, isActive: false },
    });
    await expect(
      update(manager.actor, row.id, { status: "ONBOARDING", endDate: null }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await f.db.session.update({
      where: { id: admin.session.id },
      data: { mfaVerifiedAt: new Date(Date.now() - 11 * 60_000) },
    });
    await expect(
      update(admin.actor, row.id, { status: "ONBOARDING", endDate: null }),
    ).rejects.toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
    await f.db.session.update({
      where: { id: admin.session.id },
      data: { mfaVerifiedAt: new Date() },
    });
    await update(admin.actor, row.id, { status: "ONBOARDING", endDate: null });
    expect(
      (await f.db.user.findUniqueOrThrow({ where: { id: user.id } })).isActive,
    ).toBe(false);
  });
  it("requires explicit clearing of the planned departure on cancellation", async () => {
    const a = await identity(),
      row = await employee({ status: "OFFBOARDING", endDate: "2026-12-01" });
    await expect(
      update(a.actor, row.id, { status: "ACTIVE" }),
    ).rejects.toMatchObject({ code: "CANCEL_DEPARTURE_DATE" });
    await update(a.actor, row.id, { status: "ACTIVE", endDate: null });
  });
  it("shows active departed accounts only to ADMIN and disables atomically with session revocation", async () => {
    const a = await identity(),
      manager = await identity("IT_MANAGER"),
      target = await identity("EMPLOYEE"),
      row = await employee();
    await mutateUser(f.db, a.actor, {
      operation: "employee",
      userId: target.user.id,
      employeeId: row.id,
    });
    await expect(
      update(
        manager.actor,
        row.id,
        { status: "LEFT", endDate: "2026-01-01" },
        { immediateDepartureConfirmed: true, deactivateAccount: true },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      (await f.db.employee.findUniqueOrThrow({ where: { id: row.id } })).status,
    ).toBe("ACTIVE");
    await update(
      manager.actor,
      row.id,
      { status: "LEFT", endDate: "2026-01-01" },
      { immediateDepartureConfirmed: true },
    );
    expect(
      (await departedActiveAccounts(f.db, a.actor)).rows.some(
        (item) => item.id === target.user.id,
      ),
    ).toBe(true);
    await expect(
      departedActiveAccounts(f.db, manager.actor),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await update(a.actor, row.id, {}, { deactivateAccount: true });
    expect(
      (await f.db.user.findUniqueOrThrow({ where: { id: target.user.id } }))
        .isActive,
    ).toBe(false);
    expect(
      await f.db.session.count({ where: { userId: target.user.id } }),
    ).toBe(0);
  });
  it("rolls back the whole departure when account deactivation targets oneself", async () => {
    const a = await identity(),
      row = await employee();
    await mutateUser(f.db, a.actor, {
      operation: "employee",
      userId: a.user.id,
      employeeId: row.id,
    });
    await expect(
      update(
        a.actor,
        row.id,
        { status: "LEFT", endDate: "2026-01-01" },
        { immediateDepartureConfirmed: true, deactivateAccount: true },
      ),
    ).rejects.toMatchObject({ code: "SELF_CHANGE_FORBIDDEN" });
    expect(
      (await f.db.employee.findUniqueOrThrow({ where: { id: row.id } })).status,
    ).toBe("ACTIVE");
    expect(await f.db.auditLog.count({ where: { entityId: row.id } })).toBe(0);
  });
  it("exports only allowed columns and French statuses, auditing counts without search text", async () => {
    const a = await identity(),
      row = await employee({ phone: "+33612345678" });
    const csv = await exportEmployees(f.db, a.actor, { q: row.email });
    expect(csv).toContain("Actif");
    expect(csv).not.toContain("telephone");
    expect(csv).not.toContain(row.phone);
    const audit = await f.db.auditLog.findFirstOrThrow({
      where: { action: "EMPLOYEES_EXPORTED", userId: a.user.id },
    });
    expect(JSON.stringify(audit.changes)).not.toContain(row.email);
    expect(audit.changes).toMatchObject({
      count: 1,
      filters: { searchUsed: true },
    });
  });
});
describe("reference locking and historical usage", () => {
  it.each(["organizations", "departments", "locations"] as const)(
    "creates, edits and rejects TECHNICIAN mutations for %s",
    async (kind) => {
      const a = await identity("IT_MANAGER"),
        technician = await identity("TECHNICIAN");
      const org = await f.db.organization.create({
        data: { name: randomUUID() },
      });
      const data = {
        kind,
        operation: "save",
        fields: {
          name: randomUUID(),
          organizationId: kind === "departments" ? org.id : null,
          address: null,
          city: null,
        },
      };
      await expect(
        mutateReference(f.db, technician.actor, data),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      const created = await mutateReference(f.db, a.actor, data);
      const before = (await listReferences(f.db, a.actor, kind)).find(
        (row) => row.id === created.id,
      )!;
      await mutateReference(f.db, a.actor, {
        ...data,
        id: before.id,
        updatedAt: before.updatedAt,
        fields: { ...data.fields, name: data.fields.name + "-updated" },
      });
      await expect(
        mutateReference(f.db, a.actor, {
          ...data,
          id: before.id,
          updatedAt: before.updatedAt,
        }),
      ).rejects.toMatchObject({ code: "STALE_RECORD" });
      expect(
        (await listReferences(f.db, technician.actor, kind)).find(
          (row) => row.id === created.id,
        )?.name,
      ).toBe(data.fields.name + "-updated");
    },
  );
  it("serializes employee attachment against reference deletion without losing the link", async () => {
    const a = await identity(),
      org = await f.db.organization.create({ data: { name: randomUUID() } });
    const email = f.email();
    const results = await Promise.allSettled([
      mutateEmployee(f.db, a.actor, {
        fields: fields({ email, organizationId: org.id }),
      }),
      mutateReference(f.db, a.actor, {
        kind: "organizations",
        operation: "delete",
        id: org.id,
        updatedAt: org.updatedAt.toISOString(),
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const row = await f.db.employee.findUnique({ where: { email } });
    if (row) expect(row.organizationId).toBe(org.id);
    else
      expect(
        await f.db.organization.findUnique({ where: { id: org.id } }),
      ).toBeNull();
  });
  it("refuses deletion and department moves with detailed historical counts", async () => {
    const a = await identity(),
      org = await f.db.organization.create({ data: { name: randomUUID() } }),
      other = await f.db.organization.create({ data: { name: randomUUID() } });
    const dept = await f.db.department.create({
        data: { name: "Support", organizationId: org.id },
      }),
      location = await f.db.location.create({ data: { name: randomUUID() } });
    await employee({
      organizationId: org.id,
      departmentId: dept.id,
      locationId: location.id,
      status: "LEFT",
      endDate: "2026-01-01",
    });
    for (const [kind, row] of [
      ["organizations", org],
      ["departments", dept],
      ["locations", location],
    ] as const)
      await expect(
        mutateReference(f.db, a.actor, {
          kind,
          operation: "delete",
          id: row.id,
          updatedAt: row.updatedAt.toISOString(),
        }),
      ).rejects.toMatchObject({
        code: "REFERENCE_IN_USE",
        details: { employees: 1 },
      });
    await expect(
      mutateReference(f.db, a.actor, {
        kind: "departments",
        operation: "save",
        id: dept.id,
        updatedAt: dept.updatedAt.toISOString(),
        fields: {
          name: dept.name,
          organizationId: other.id,
          address: null,
          city: null,
        },
      }),
    ).rejects.toMatchObject({ code: "DEPARTMENT_HAS_EMPLOYEES" });
  });
  it("allows deletion of an unused reference with a durable sanitized audit", async () => {
    const a = await identity(),
      location = await f.db.location.create({ data: { name: randomUUID() } });
    await mutateReference(f.db, a.actor, {
      kind: "locations",
      operation: "delete",
      id: location.id,
      updatedAt: location.updatedAt.toISOString(),
    });
    expect(
      await f.db.location.findUnique({ where: { id: location.id } }),
    ).toBeNull();
    expect(
      await f.db.auditLog.count({
        where: { entityId: location.id, action: "REFERENCE_DELETED" },
      }),
    ).toBe(1);
  });
});
describe("atomic employee imports", () => {
  it("rolls back approved references and all rows when linked-account deactivation is forbidden", async () => {
    const a = await identity(),
      own = await employee();
    await mutateUser(f.db, a.actor, {
      operation: "employee",
      userId: a.user.id,
      employeeId: own.id,
    });
    const newEmail = f.email(),
      organization = randomUUID();
    const bytes = file(
      [
        newEmail + ";New;Person;Actif;;" + organization,
        own.email + ";Céline;Lefèvre;Parti;01/01/2026;" + organization,
      ],
      "email;prenom;nom;statut;date_depart;organisation",
    );
    const preview = await previewEmployeeImport(f.db, a.actor, bytes);
    await expect(
      confirmEmployeeImport(f.db, a.actor, bytes, {
        previewId: preview.previewId,
        options: preview.options,
        approvedReferences: preview.references.map((ref) => ref.id),
        immediateDepartureConfirmed: true,
        deactivateAccount: true,
      }),
    ).rejects.toMatchObject({ code: "SELF_CHANGE_FORBIDDEN" });
    expect(
      await f.db.organization.findUnique({ where: { name: organization } }),
    ).toBeNull();
    expect(
      await f.db.employee.findUnique({ where: { email: newEmail } }),
    ).toBeNull();
    expect(
      (await f.db.employee.findUniqueOrThrow({ where: { id: own.id } })).status,
    ).toBe("ACTIVE");
  });
  it("rejects an expired preview and permits only one concurrent confirmation", async () => {
    const a = await identity(),
      bytes = file([f.email() + ";A;B;Actif"]);
    const expired = await previewEmployeeImport(f.db, a.actor, bytes);
    await f.db.verification.update({
      where: { id: expired.previewId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(
      confirmEmployeeImport(f.db, a.actor, bytes, {
        previewId: expired.previewId,
        options: expired.options,
        approvedReferences: [],
      }),
    ).rejects.toMatchObject({ code: "PREVIEW_EXPIRED" });
    const preview = await previewEmployeeImport(f.db, a.actor, bytes);
    const confirmation = {
      previewId: preview.previewId,
      options: preview.options,
      approvedReferences: [],
    };
    const results = await Promise.allSettled([
      confirmEmployeeImport(f.db, a.actor, bytes, confirmation),
      confirmEmployeeImport(f.db, a.actor, bytes, confirmation),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === "rejected"),
    ).toMatchObject({ reason: { code: "PREVIEW_EXPIRED" } });
  });
  it("reads French Excel, dates and phone then recomputes accent-free search", async () => {
    const a = await identity(),
      email = f.email();
    const bytes = Buffer.from(
      "email;prenom;nom;statut;date_arrivee;telephone\n" +
        email +
        ";Céline;Lefèvre;ACTIF;15/01/2026;+33 6 12 34 56 78",
      "latin1",
    );
    const { preview } = await importFile(a.actor, bytes);
    expect(preview.encoding).toBe("windows-1252");
    expect(preview.rows[0].status).toBe("Actif");
    const row = await f.db.employee.findUniqueOrThrow({ where: { email } });
    expect(row.startDate?.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(row.phone).toBe("+33612345678");
    expect(row.searchText).toContain("celine lefevre");
  });
  it("reports all three errors in a 500-row file and commits nothing", async () => {
    const a = await identity();
    const bytes = file(
      Array.from(
        { length: 500 },
        (_, index) =>
          f.email() +
          ";Test;Fixture;" +
          ([4, 177, 498].includes(index) ? "inconnu" : "Actif"),
      ),
    );
    const preview = await previewEmployeeImport(f.db, a.actor, bytes);
    expect(preview.rows).toHaveLength(500);
    expect(preview.rows.filter((row) => row.errors.length)).toHaveLength(3);
    await expect(
      confirmEmployeeImport(f.db, a.actor, bytes, {
        previewId: preview.previewId,
        options: preview.options,
        approvedReferences: [],
      }),
    ).rejects.toMatchObject({ code: "IMPORT_HAS_ERRORS" });
    expect(
      await f.db.employee.count({
        where: { email: { in: preview.rows.map((row) => row.email) } },
      }),
    ).toBe(0);
  });
  it("rejects altered bytes, changed database versions, cross-session receipt and replay", async () => {
    const a = await identity(),
      b = await identity(),
      email = f.email(),
      bytes = file([email + ";Test;Fixture;Actif"]);
    const preview = await previewEmployeeImport(f.db, a.actor, bytes);
    const confirmation = {
      previewId: preview.previewId,
      options: preview.options,
      approvedReferences: [],
    };
    await expect(
      confirmEmployeeImport(
        f.db,
        a.actor,
        Buffer.concat([bytes, Buffer.from("\n")]),
        confirmation,
      ),
    ).rejects.toMatchObject({ code: "PREVIEW_CHANGED" });
    await expect(
      confirmEmployeeImport(f.db, b.actor, bytes, confirmation),
    ).rejects.toMatchObject({ code: "PREVIEW_EXPIRED" });
    await employee();
    await expect(
      confirmEmployeeImport(f.db, a.actor, bytes, confirmation),
    ).rejects.toMatchObject({ code: "PREVIEW_CHANGED" });
    const latest = await previewEmployeeImport(f.db, a.actor, bytes);
    await confirmEmployeeImport(f.db, a.actor, bytes, {
      ...confirmation,
      previewId: latest.previewId,
    });
    await expect(
      confirmEmployeeImport(f.db, a.actor, bytes, {
        ...confirmation,
        previewId: latest.previewId,
      }),
    ).rejects.toMatchObject({ code: "PREVIEW_EXPIRED" });
  });
  it("resolves a manager later in the same file and only creates approved references", async () => {
    const a = await identity(),
      manager = f.email(),
      report = f.email(),
      org = randomUUID();
    const bytes = file(
      [
        report + ";Report;Fixture;Actif;" + manager + ";" + org + ";Support",
        manager + ";Manager;Fixture;Actif;;" + org + ";Support",
      ],
      "email;prenom;nom;statut;manager_email;organisation;pole",
    );
    const preview = await previewEmployeeImport(f.db, a.actor, bytes);
    expect(preview.hasErrors).toBe(false);
    expect(preview.references).toHaveLength(2);
    await expect(
      confirmEmployeeImport(f.db, a.actor, bytes, {
        previewId: preview.previewId,
        options: preview.options,
        approvedReferences: [],
      }),
    ).rejects.toMatchObject({ code: "REFERENCES_NOT_APPROVED" });
    expect(
      await f.db.organization.findUnique({ where: { name: org } }),
    ).toBeNull();
    await confirmEmployeeImport(f.db, a.actor, bytes, {
      previewId: preview.previewId,
      options: preview.options,
      approvedReferences: preview.references.map((ref) => ref.id),
    });
    const parent = await f.db.employee.findUniqueOrThrow({
        where: { email: manager },
      }),
      child = await f.db.employee.findUniqueOrThrow({
        where: { email: report },
      });
    expect(child.managerId).toBe(parent.id);
  });
  it("finds duplicate normalized emails, unknown sites and a three-row cycle", async () => {
    const a = await identity(),
      first = f.email(),
      second = f.email(),
      third = f.email();
    const cyclic = await previewEmployeeImport(
      f.db,
      a.actor,
      file(
        [
          first + ";A;A;" + second,
          second + ";B;B;" + third,
          third + ";C;C;" + first,
        ],
        "email;prenom;nom;manager_email",
      ),
    );
    expect(
      cyclic.rows.every((row) =>
        row.errors.some((error) => error.message.includes("boucle")),
      ),
    ).toBe(true);
    const invalid = await previewEmployeeImport(
      f.db,
      a.actor,
      file(
        [first + ";A;A;Unknown", first.toUpperCase() + ";B;B;"],
        "email;prenom;nom;site",
      ),
    );
    expect(
      invalid.rows.every((row) =>
        row.errors.some((error) => error.field === "email"),
      ),
    ).toBe(true);
    expect(invalid.rows[0].errors.some((error) => error.field === "site")).toBe(
      true,
    );
  });
  it("keeps empty update cells and clears only with the explicit marker", async () => {
    const a = await identity(),
      row = await employee({ jobTitle: "Support", phone: "+33612345678" });
    await importFile(
      a.actor,
      file(
        [row.email + ";Céline;Lefèvre;;__CLEAR__"],
        "email;prenom;nom;poste;telephone",
      ),
    );
    const changed = await f.db.employee.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(changed.jobTitle).toBe("Support");
    expect(changed.phone).toBeNull();
  });
  it("supports immediate departure in import only after explicit confirmation", async () => {
    const a = await identity("IT_MANAGER"),
      row = await employee();
    const bytes = file(
      [row.email + ";Céline;Lefèvre;Parti;01/01/2026"],
      "email;prenom;nom;statut;date_depart",
    );
    const preview = await previewEmployeeImport(f.db, a.actor, bytes);
    expect(preview.immediateDepartures).toBe(1);
    await expect(
      confirmEmployeeImport(f.db, a.actor, bytes, {
        previewId: preview.previewId,
        options: preview.options,
        approvedReferences: [],
      }),
    ).rejects.toMatchObject({
      code: "IMMEDIATE_DEPARTURE_CONFIRMATION_REQUIRED",
    });
    await confirmEmployeeImport(f.db, a.actor, bytes, {
      previewId: preview.previewId,
      options: preview.options,
      approvedReferences: [],
      immediateDepartureConfirmed: true,
    });
  });
  it("reassigns reports in the same import before departing their manager", async () => {
    const a = await identity(),
      manager = await employee(),
      report = await employee({ managerId: manager.id });
    const bytes = file(
      [
        manager.email + ";M;M;Parti;01/01/2026;",
        report.email + ";R;R;Actif;;__CLEAR__",
      ],
      "email;prenom;nom;statut;date_depart;manager_email",
    );
    await importFile(a.actor, bytes, { immediateDepartureConfirmed: true });
    expect(
      (await f.db.employee.findUniqueOrThrow({ where: { id: report.id } }))
        .managerId,
    ).toBeNull();
  });
  it.each(["EMPLOYEE", "TECHNICIAN"] as const)(
    "rejects import for %s",
    async (role) => {
      const a = await identity(role);
      await expect(
        previewEmployeeImport(f.db, a.actor, file([f.email() + ";A;B;Actif"])),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );
  it("stores hashes only in the preview receipt and sanitizes individual audits", async () => {
    const a = await identity(),
      email = f.email(),
      bytes = file([email + ";Céline;Lefèvre;Actif"]);
    const preview = await previewEmployeeImport(f.db, a.actor, bytes);
    const receipt = await f.db.verification.findUniqueOrThrow({
      where: { id: preview.previewId },
    });
    expect(receipt.value).not.toContain(email);
    expect(receipt.value).not.toContain("Céline");
    await confirmEmployeeImport(f.db, a.actor, bytes, {
      previewId: preview.previewId,
      options: preview.options,
      approvedReferences: [],
    });
    const audit = await f.db.auditLog.findMany({
      where: { userId: a.user.id },
    });
    expect(JSON.stringify(audit)).not.toContain(email);
    expect(JSON.stringify(audit)).not.toContain("Céline");
  });
});
