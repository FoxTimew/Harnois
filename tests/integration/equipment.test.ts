import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/client";
import { authFixture, type AuthFixture } from "../fixtures/auth";
import {
  equipmentFieldsSchema,
  type EquipmentFields,
} from "@/lib/equipment-validation";
import {
  mutateEquipment,
  equipmentFields,
  equipmentDetail,
  listEquipment,
  employeeEquipment,
  exportEquipment,
} from "@/server/services/equipment";
import {
  assignEquipment,
  closeAssignment,
  changeLoanDate,
} from "@/server/services/equipment-assignments";
import { mutateCategory, listCategories } from "@/server/services/categories";
import { mutateSupplier } from "@/server/services/suppliers";
import {
  previewEquipmentImport,
  confirmEquipmentImport,
} from "@/server/services/equipment-import";
import {
  equipmentCertificate,
  equipmentLabels,
} from "@/server/services/equipment-documents";
import * as pdfModule from "@/server/pdf/equipment";
let f: AuthFixture;
beforeEach(() => {
  f = authFixture();
});
afterEach(async () => {
  vi.restoreAllMocks();
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
      expiresAt: new Date(Date.now() + 3600000),
      mfaVerifiedAt: role !== "EMPLOYEE" ? new Date() : null,
    },
  });
  return { user, actor: { userId: user.id, sessionId: session.id } };
}
async function employee() {
  return f.db.employee.create({
    data: {
      email: f.email(),
      firstName: "Céline",
      lastName: "Démonstration",
      searchText: "celine demonstration",
      status: "ACTIVE",
    },
  });
}
async function setup(role: UserRole = "ADMIN") {
  const a = await identity(role),
    category = await f.db.category.create({ data: { name: randomUUID() } });
  return { ...a, category };
}
async function equipment(
  actor: Awaited<ReturnType<typeof identity>>["actor"],
  categoryId: string,
  overrides: Partial<EquipmentFields> = {},
) {
  const { id } = await mutateEquipment(f.db, actor, {
    fields: { name: "Écran de démonstration", categoryId, ...overrides },
  });
  return f.db.equipment.findUniqueOrThrow({ where: { id } });
}
async function update(
  actor: Awaited<ReturnType<typeof identity>>["actor"],
  id: string,
  overrides: Partial<EquipmentFields>,
  reason = "Raison de test",
) {
  const old = await f.db.equipment.findUniqueOrThrow({ where: { id } });
  return mutateEquipment(f.db, actor, {
    id,
    updatedAt: old.updatedAt.toISOString(),
    fields: { ...equipmentFields(old), ...overrides },
    reason,
  });
}
async function assign(
  actor: Awaited<ReturnType<typeof identity>>["actor"],
  equipmentId: string,
  employeeId: string,
  extra = {},
) {
  return assignEquipment(f.db, actor, {
    equipmentId,
    employeeId,
    kind: "PERMANENT",
    conditionOut: "GOOD",
    ...extra,
  });
}
describe("equipment transactional boundaries", () => {
  it("preserves unchanged imported records and their updatedAt", async () => {
    const a = await setup(),
      item = await equipment(a.actor, a.category.id);
    const bytes = Buffer.from(
      "numero_inventaire;designation;categorie\n" + item.assetTag + ";;",
    );
    const p = await previewEquipmentImport(f.db, a.actor, bytes);
    expect(p.totals.unchanged).toBe(1);
    await confirmEquipmentImport(f.db, a.actor, bytes, {
      previewId: p.previewId,
      options: p.options,
      approvedReferences: [],
    });
    expect(
      (
        await f.db.equipment.findUniqueOrThrow({ where: { id: item.id } })
      ).updatedAt.toISOString(),
    ).toBe(item.updatedAt.toISOString());
  });
  it("rejects expired previews and a mixed valid/invalid import without writes", async () => {
    const a = await setup(),
      bytes = Buffer.from(
        "designation;categorie;prix_achat\nValide;" +
          a.category.name +
          ";12,50\nInvalide;" +
          a.category.name +
          ";incorrect",
      );
    const p = await previewEquipmentImport(f.db, a.actor, bytes),
      data = {
        previewId: p.previewId,
        options: p.options,
        approvedReferences: [],
      };
    await expect(
      confirmEquipmentImport(f.db, a.actor, bytes, data),
    ).rejects.toMatchObject({ code: "IMPORT_HAS_ERRORS" });
    expect(
      await f.db.equipment.count({ where: { categoryId: a.category.id } }),
    ).toBe(0);
    await f.db.verification.update({
      where: { id: p.previewId },
      data: { expiresAt: new Date(0) },
    });
    await expect(
      confirmEquipmentImport(f.db, a.actor, bytes, data),
    ).rejects.toMatchObject({ code: "PREVIEW_EXPIRED" });
  });
  it("serializes category deletion against attaching new equipment", async () => {
    const a = await setup();
    const result = await Promise.allSettled([
      equipment(a.actor, a.category.id),
      mutateCategory(f.db, a.actor, {
        id: a.category.id,
        name: a.category.name,
        updatedAt: a.category.updatedAt.toISOString(),
        operation: "delete",
      }),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const count = await f.db.equipment.count({
        where: { categoryId: a.category.id },
      }),
      exists = await f.db.category.count({ where: { id: a.category.id } });
    expect(count === 0 || exists === 1).toBe(true);
  });
  it("exports the complete CSV with active loan details and audits filters without text", async () => {
    const a = await setup(),
      item = await equipment(a.actor, a.category.id),
      e = await employee();
    await assign(a.actor, item.id, e.id, {
      kind: "LOAN",
      expectedReturnDate: "2099-01-01",
    });
    const csv = await exportEquipment(f.db, a.actor, { q: item.assetTag });
    expect(csv).toContain("retour_prevu");
    expect(csv).toContain(e.email);
    expect(csv).toContain("2099-01-01");
    expect(csv).toContain("En prêt");
    const invalid = await previewEquipmentImport(
      f.db,
      a.actor,
      Buffer.from(
        "numero_inventaire;designation;categorie;retour_prevu\n" +
          item.assetTag +
          ";;;2020-01-01",
      ),
    );
    expect(invalid.hasErrors).toBe(true);
    expect(invalid.rows[0].errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "retour_prevu" }),
      ]),
    );
    const audit = await f.db.auditLog.findFirstOrThrow({
      where: { userId: a.user.id, action: "EQUIPMENT_EXPORTED" },
    });
    expect(JSON.stringify(audit.changes)).not.toContain(item.assetTag);
  });
  it("allows exactly one of two concurrent assignments", async () => {
    const a = await setup(),
      item = await equipment(a.actor, a.category.id),
      one = await employee(),
      two = await employee();
    const results = await Promise.allSettled([
      assign(a.actor, item.id, one.id),
      assign(a.actor, item.id, two.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await f.db.equipmentAssignment.count({
        where: { equipmentId: item.id, returnedAt: null },
      }),
    ).toBe(1);
  });
  it("allocates distinct numbers for concurrent creations", async () => {
    const a = await setup(),
      items = await Promise.all([
        equipment(a.actor, a.category.id),
        equipment(a.actor, a.category.id),
      ]);
    expect(new Set(items.map((i) => i.assetTag)).size).toBe(2);
    expect(new Set(items.map((i) => i.inventoryNumber)).size).toBe(2);
  });
  it("skips a manually occupied next tag", async () => {
    const a = await setup(),
      first = await equipment(a.actor, a.category.id);
    const reserved =
      "HRN-" + String(first.inventoryNumber + 2).padStart(6, "0");
    await equipment(a.actor, a.category.id, { assetTag: reserved });
    expect((await equipment(a.actor, a.category.id)).assetTag).not.toBe(
      reserved,
    );
  });
  it("omits price from TECHNICIAN DTOs and forbids price writes and exports", async () => {
    const a = await setup(),
      item = await equipment(a.actor, a.category.id, {
        purchasePrice: "1299,90",
      }),
      tech = await identity("TECHNICIAN");
    const detail = await equipmentDetail(f.db, tech.actor, item.id),
      list = await listEquipment(f.db, tech.actor, { q: item.assetTag });
    expect(detail).not.toHaveProperty("purchasePrice");
    expect(list.rows[0]).not.toHaveProperty("purchasePrice");
    await expect(
      update(tech.actor, item.id, { purchasePrice: "1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(exportEquipment(f.db, tech.actor, {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("isolates EMPLOYEE material and never exposes next holders in history", async () => {
    const a = await setup(),
      item = await equipment(a.actor, a.category.id),
      own = await employee(),
      other = await employee(),
      e = await identity("EMPLOYEE");
    await f.db.user.update({
      where: { id: e.user.id },
      data: { employeeId: own.id },
    });
    const movement = await assign(a.actor, item.id, own.id);
    expect(
      (await equipmentDetail(f.db, e.actor, item.id)).history,
    ).toHaveLength(1);
    await closeAssignment(f.db, a.actor, {
      assignmentId: movement.id,
      operation: "return",
      conditionIn: "GOOD",
    });
    await assign(a.actor, item.id, other.id);
    await expect(equipmentDetail(f.db, e.actor, item.id)).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
    const history = await employeeEquipment(f.db, e.actor, own.id);
    expect(JSON.stringify(history)).not.toContain(other.id);
    expect(history[0].equipment).not.toHaveProperty("status");
    await expect(
      employeeEquipment(f.db, e.actor, other.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listEquipment(f.db, e.actor, {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("rejects retirement while assigned and every transition out of retired", async () => {
    const a = await setup(),
      item = await equipment(a.actor, a.category.id),
      e = await employee(),
      movement = await assign(a.actor, item.id, e.id);
    await expect(
      update(a.actor, item.id, { status: "RETIRED" }),
    ).rejects.toMatchObject({ code: "INVALID_STATUS_TRANSITION" });
    await closeAssignment(f.db, a.actor, {
      assignmentId: movement.id,
      operation: "return",
      conditionIn: "GOOD",
    });
    await update(a.actor, item.id, { status: "RETIRED" });
    for (const status of [
      "IN_STOCK",
      "IN_REPAIR",
      "LOST",
      "ASSIGNED",
      "LOANED",
    ] as const)
      await expect(update(a.actor, item.id, { status })).rejects.toMatchObject({
        code: "INVALID_STATUS_TRANSITION",
      });
  });
  it("returns damaged equipment to repair and requires notes to report or recover a loss", async () => {
    const a = await setup(),
      item = await equipment(a.actor, a.category.id),
      e = await employee(),
      first = await assign(a.actor, item.id, e.id);
    await closeAssignment(f.db, a.actor, {
      assignmentId: first.id,
      operation: "return",
      conditionIn: "DAMAGED",
    });
    expect(
      (await f.db.equipment.findUniqueOrThrow({ where: { id: item.id } }))
        .status,
    ).toBe("IN_REPAIR");
    await update(a.actor, item.id, { status: "IN_STOCK", condition: "GOOD" });
    const second = await assign(a.actor, item.id, e.id);
    await expect(
      closeAssignment(f.db, a.actor, {
        assignmentId: second.id,
        operation: "lost",
      }),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await closeAssignment(f.db, a.actor, {
      assignmentId: second.id,
      operation: "lost",
      notes: "Perte déclarée",
    });
    await expect(
      update(a.actor, item.id, { status: "IN_STOCK" }, ""),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await update(a.actor, item.id, { status: "IN_STOCK" }, "Retrouvé");
    expect(
      await f.db.equipmentAssignment.count({ where: { equipmentId: item.id } }),
    ).toBe(2);
  });
  it("requires a loan deadline and audits its change", async () => {
    const a = await setup(),
      item = await equipment(a.actor, a.category.id),
      e = await employee();
    await expect(
      assign(a.actor, item.id, e.id, { kind: "LOAN" }),
    ).rejects.toMatchObject({ code: "LOAN_DATE_REQUIRED" });
    const movement = await assign(a.actor, item.id, e.id, {
      kind: "LOAN",
      expectedReturnDate: "2099-01-01",
    });
    await changeLoanDate(f.db, a.actor, {
      assignmentId: movement.id,
      expectedReturnDate: "2099-02-01",
    });
    expect(
      await f.db.auditLog.count({
        where: { entityId: movement.id, action: "LOAN_DATE_CHANGED" },
      }),
    ).toBe(1);
  });
  it("rejects an employee who has left", async () => {
    const a = await setup(),
      item = await equipment(a.actor, a.category.id),
      e = await employee();
    await f.db.employee.update({
      where: { id: e.id },
      data: { status: "LEFT" },
    });
    await expect(assign(a.actor, item.id, e.id)).rejects.toMatchObject({
      code: "EMPLOYEE_UNAVAILABLE",
    });
  });
  it("rejects category cycles and deletion of used categories and suppliers", async () => {
    const a = await setup(),
      child = await f.db.category.create({
        data: { name: randomUUID(), parentId: a.category.id },
      });
    await expect(
      mutateCategory(f.db, a.actor, {
        id: a.category.id,
        updatedAt: a.category.updatedAt.toISOString(),
        name: a.category.name,
        parentId: child.id,
      }),
    ).rejects.toMatchObject({ code: "CATEGORY_CYCLE" });
    await expect(
      mutateCategory(f.db, a.actor, {
        id: a.category.id,
        updatedAt: a.category.updatedAt.toISOString(),
        name: a.category.name,
        operation: "delete",
      }),
    ).rejects.toMatchObject({ code: "REFERENCE_IN_USE" });
    const supplier = await f.db.supplier.create({
      data: { name: randomUUID() },
    });
    await equipment(a.actor, a.category.id, { supplierId: supplier.id });
    await expect(
      mutateSupplier(f.db, a.actor, {
        id: supplier.id,
        updatedAt: supplier.updatedAt.toISOString(),
        name: supplier.name,
        operation: "delete",
      }),
    ).rejects.toMatchObject({ code: "REFERENCE_IN_USE" });
  });
  it("inherits typed specs, prevents type changes and preserves disabled values", async () => {
    const a = await setup(),
      defs = [
        {
          key: "ram",
          label: "Mémoire",
          type: "number",
          unit: "Go",
          disabled: false,
        },
      ];
    await mutateCategory(f.db, a.actor, {
      id: a.category.id,
      updatedAt: a.category.updatedAt.toISOString(),
      name: a.category.name,
      specDefinitions: defs,
    });
    const child = await f.db.category.create({
      data: { name: randomUUID(), parentId: a.category.id },
    });
    const item = await equipment(a.actor, child.id, { specs: { ram: 16 } });
    expect(
      (await equipmentDetail(f.db, a.actor, item.id)).definitions[0].key,
    ).toBe("ram");
    const parent = await f.db.category.findUniqueOrThrow({
      where: { id: a.category.id },
    });
    await expect(
      mutateCategory(f.db, a.actor, {
        id: parent.id,
        updatedAt: parent.updatedAt.toISOString(),
        name: parent.name,
        specDefinitions: [{ ...defs[0], type: "text" }],
      }),
    ).rejects.toMatchObject({ code: "IMMUTABLE_SPEC_TYPE" });
    await mutateCategory(f.db, a.actor, {
      id: parent.id,
      updatedAt: parent.updatedAt.toISOString(),
      name: parent.name,
      specDefinitions: [{ ...defs[0], disabled: true }],
    });
    await expect(
      update(a.actor, item.id, { specs: { ram: 32 } }),
    ).rejects.toMatchObject({ code: "INVALID_SPECS" });
  });
  it("finds accent-insensitive substrings and rejects stale edits", async () => {
    const a = await setup(),
      item = await equipment(a.actor, a.category.id, {
        name: "Périphérique ÉLÉGANT",
      });
    expect(
      (await listEquipment(f.db, a.actor, { q: "ELEGANT" })).rows.map(
        (r) => r.id,
      ),
    ).toContain(item.id);
    await update(a.actor, item.id, { name: "Modifié" });
    await expect(
      mutateEquipment(f.db, a.actor, {
        id: item.id,
        updatedAt: item.updatedAt.toISOString(),
        fields: equipmentFields(item),
      }),
    ).rejects.toMatchObject({ code: "STALE_RECORD" });
  });
  it("enforces reference mutation permissions", async () => {
    const a = await setup("TECHNICIAN");
    expect(await listCategories(f.db, a.actor)).toBeDefined();
    await expect(
      mutateCategory(f.db, a.actor, { name: "Interdit" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      mutateSupplier(f.db, a.actor, { name: "Interdit" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("imports exact French amounts, creates assignments and consumes the receipt once", async () => {
    const a = await setup(),
      e = await employee(),
      bytes = Buffer.from(
        "designation;categorie;prix_achat;employe_email\nPortable;" +
          a.category.name +
          ";1 299,90;" +
          e.email,
      );
    const preview = await previewEquipmentImport(f.db, a.actor, bytes);
    expect(preview.hasErrors).toBe(false);
    const data = {
      previewId: preview.previewId,
      options: preview.options,
      approvedReferences: [],
    };
    await confirmEquipmentImport(f.db, a.actor, bytes, data);
    const assignment = await f.db.equipmentAssignment.findFirstOrThrow({
      where: { employeeId: e.id },
      include: { equipment: true },
    });
    expect(assignment.equipment.purchasePrice?.toFixed(2)).toBe("1299.90");
    expect(assignment.equipment.status).toBe("ASSIGNED");
    await expect(
      confirmEquipmentImport(f.db, a.actor, bytes, data),
    ).rejects.toMatchObject({ code: "PREVIEW_EXPIRED" });
  });
  it("rejects altered files, another session and changed database after preview", async () => {
    const a = await setup(),
      bytes = Buffer.from("designation;categorie\nPortable;" + a.category.name),
      p = await previewEquipmentImport(f.db, a.actor, bytes);
    const data = {
      previewId: p.previewId,
      options: p.options,
      approvedReferences: [],
    };
    await expect(
      confirmEquipmentImport(
        f.db,
        a.actor,
        Buffer.concat([bytes, Buffer.from(" ")]),
        data,
      ),
    ).rejects.toMatchObject({ code: "PREVIEW_CHANGED" });
    const other = await identity();
    await expect(
      confirmEquipmentImport(f.db, other.actor, bytes, data),
    ).rejects.toMatchObject({ code: "PREVIEW_EXPIRED" });
    await equipment(a.actor, a.category.id);
    await expect(
      confirmEquipmentImport(f.db, a.actor, bytes, data),
    ).rejects.toMatchObject({ code: "PREVIEW_CHANGED" });
  });
  it("requires reference approval and rolls back invalid rows", async () => {
    const a = await setup(),
      name = randomUUID(),
      bytes = Buffer.from(
        "designation;categorie;fournisseur\nPortable;" +
          name +
          ";" +
          randomUUID(),
      );
    const p = await previewEquipmentImport(f.db, a.actor, bytes),
      data = {
        previewId: p.previewId,
        options: p.options,
        approvedReferences: [] as string[],
      };
    await expect(
      confirmEquipmentImport(f.db, a.actor, bytes, data),
    ).rejects.toMatchObject({ code: "REFERENCES_NOT_APPROVED" });
    expect(await f.db.category.count({ where: { name } })).toBe(0);
    await confirmEquipmentImport(f.db, a.actor, bytes, {
      ...data,
      approvedReferences: p.references.map((r) => r.id),
    });
    expect(await f.db.category.count({ where: { name } })).toBe(1);
  });
  it("reports unknown sites, duplicate serials and unavailable employees in the preview", async () => {
    const a = await setup(),
      item = await equipment(a.actor, a.category.id, {
        serialNumber: randomUUID(),
      }),
      e = await employee();
    await f.db.employee.update({
      where: { id: e.id },
      data: { status: "LEFT" },
    });
    const bytes = Buffer.from(
      "designation;categorie;numero_serie;site;employe_email\nAutre;" +
        a.category.name +
        ";" +
        item.serialNumber +
        ";Introuvable;" +
        e.email,
    );
    const p = await previewEquipmentImport(f.db, a.actor, bytes);
    expect(p.hasErrors).toBe(true);
    expect(p.rows[0].errors.length).toBeGreaterThanOrEqual(3);
  });
  it("generates real PDF certificates from current data and audits only metadata", async () => {
    const a = await setup(),
      item = await equipment(a.actor, a.category.id),
      e = await employee(),
      movement = await assign(a.actor, item.id, e.id);
    await expect(
      equipmentCertificate(f.db, a.actor, {
        assignmentIds: [movement.id],
        kind: "handover",
      }),
    ).rejects.toMatchObject({ code: "ORGANIZATION_REQUIRED" });
    const org = await f.db.organization.create({
      data: { name: "Organisation Démonstration " + randomUUID() },
    });
    await f.db.employee.update({
      where: { id: e.id },
      data: { organizationId: org.id },
    });
    const spy = vi.spyOn(pdfModule, "renderCertificate");
    const pdf = await equipmentCertificate(f.db, a.actor, {
      assignmentIds: [movement.id],
      kind: "handover",
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5000);
    expect(spy.mock.calls[0][0]).toMatchObject({
      organization: org.name,
      employee: "Céline Démonstration",
      rows: [{ assetTag: item.assetTag, name: item.name }],
    });
    const audit = await f.db.auditLog.findFirstOrThrow({
      where: { userId: a.user.id, action: "EQUIPMENT_DOCUMENT_GENERATED" },
    });
    expect(JSON.stringify(audit.changes)).not.toContain("Céline");
    await closeAssignment(f.db, a.actor, {
      assignmentId: movement.id,
      operation: "return",
      conditionIn: "GOOD",
    });
    expect(
      (
        await equipmentCertificate(f.db, a.actor, {
          assignmentIds: [movement.id],
          kind: "return",
        })
      )
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");
  });
  it("generates sheets and single labels and rejects EMPLOYEE documents", async () => {
    const a = await setup(),
      item = await equipment(a.actor, a.category.id),
      e = await identity("EMPLOYEE");
    for (const format of ["sheet", "single"])
      expect(
        (await equipmentLabels(f.db, a.actor, { ids: [item.id], format }))
          .subarray(0, 5)
          .toString(),
      ).toBe("%PDF-");
    await expect(
      equipmentLabels(f.db, e.actor, { ids: [item.id] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("validates financial inputs before any write", () =>
    expect(
      equipmentFieldsSchema.safeParse({
        name: "Test",
        categoryId: "test",
        purchasePrice: 1299.9,
      }).success,
    ).toBe(false));
});
