import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type UserRole } from "../../src/generated/prisma/client";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  log: [],
});
let batch: string,
  categoryId: string,
  organizationId: string,
  employeeId: string,
  otherId: string,
  itemId: string,
  stockId: string,
  assignmentId: string;
const users: string[] = [],
  ips: string[] = [];
const password = "Equipment-browser-password-42";
test.use({ actionTimeout: 15000 });
test.beforeEach(async () => {
  batch = "p05-" + randomUUID().slice(0, 8);
  const org = await db.organization.create({
    data: { name: "Atelier Démonstration " + batch },
  });
  organizationId = org.id;
  const category = await db.category.create({
    data: {
      name: "Portables " + batch,
      icon: "computer",
      specDefinitions: [
        {
          key: "cpu",
          label: "Processeur",
          type: "text",
          disabled: false,
          unit: "",
          choices: [],
        },
        {
          key: "ram",
          label: "Mémoire vive",
          type: "number",
          unit: "Go",
          choices: [],
          disabled: false,
        },
        {
          key: "os",
          label: "Système",
          type: "choice",
          choices: ["Windows 11", "Linux", "macOS"],
          unit: "",
          disabled: false,
        },
      ],
    },
  });
  categoryId = category.id;
  const employee = await db.employee.create({
    data: {
      email: "celine@" + batch + ".invalid",
      firstName: "Céline",
      lastName: "Lefèvre",
      searchText: "celine lefevre",
      status: "ACTIVE",
      organizationId,
    },
  });
  employeeId = employee.id;
  const other = await db.employee.create({
    data: {
      email: "amine@" + batch + ".invalid",
      firstName: "Amine",
      lastName: "Perrin",
      searchText: "amine perrin",
      status: "ACTIVE",
      organizationId,
    },
  });
  otherId = other.id;
  const item = await db.equipment.create({
    data: {
      assetTag: "DEMO-" + batch + "-01",
      name: "Ordinateur portable · Équipe support",
      brand: "Framework",
      model: "Laptop 13",
      serialNumber: "DEMO-SN-" + batch,
      searchText: "ordinateur portable equipe support " + batch,
      categoryId,
      status: "ASSIGNED",
      condition: "GOOD",
      purchasePrice: "1299.90",
      purchaseDate: new Date("2025-01-15"),
      warrantyEndDate: new Date("2026-12-15"),
      depreciationMonths: 36,
      specs: { cpu: "Intel Core Ultra 5", ram: 16, os: "Windows 11" },
      notes: "Matériel fictif réservé à la validation.",
    },
  });
  itemId = item.id;
  await db.equipmentAssignment.create({
    data: {
      equipmentId: itemId,
      employeeId: otherId,
      assignedAt: new Date("2025-01-15"),
      returnedAt: new Date("2025-06-01"),
      conditionOut: "NEW",
      conditionIn: "GOOD",
      closureReason: "RETURNED",
      notes: "Remise avec chargeur USB-C.",
    },
  });
  const assignment = await db.equipmentAssignment.create({
    data: {
      equipmentId: itemId,
      employeeId,
      assignedAt: new Date("2025-06-02"),
      conditionOut: "GOOD",
      notes: "Remise avec chargeur et housse.",
    },
  });
  assignmentId = assignment.id;
  const stock = await db.equipment.create({
    data: {
      assetTag: "DEMO-" + batch + "-02",
      name: "Portable disponible",
      searchText: "portable disponible " + batch,
      categoryId,
      status: "IN_STOCK",
      condition: "NEW",
      specs: { ram: 32, os: "Linux" },
    },
  });
  stockId = stock.id;
});
async function signIn(page: Page, role: UserRole) {
  const email = "compte-" + users.length + "@" + batch + ".invalid";
  const user = await db.user.create({
    data: {
      name: "Camille Martin",
      email,
      role,
      emailVerified: true,
      ...(role === "EMPLOYEE" ? { employeeId } : {}),
    },
  });
  users.push(user.id);
  await db.account.create({
    data: {
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: await hashPassword(password),
    },
  });
  if (role !== "EMPLOYEE")
    await db.totpFactor.create({
      data: {
        userId: user.id,
        secretEncrypted: "fixture",
        confirmedAt: new Date(),
      },
    });
  const ip =
    "198.20." +
    Math.floor(Math.random() * 200) +
    "." +
    (1 + Math.floor(Math.random() * 200));
  ips.push(ip);
  await page.setExtraHTTPHeaders({ "x-real-ip": ip });
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        data: { email, password },
        headers: { origin: "http://localhost:3041", "x-real-ip": ip },
      })
    ).ok(),
  ).toBe(true);
  await db.session.updateMany({
    where: { userId: user.id },
    data: { mfaVerifiedAt: new Date(), mfaMethod: "TOTP" },
  });
}
async function capture(page: Page, name: string, project: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "docs/screenshots/phase05/" + name + "-" + project + ".png",
    fullPage: true,
  });
}
test.afterEach(async () => {
  const material = await db.equipment.findMany({
    where: { categoryId },
    select: { id: true },
  });
  const ids = material.map((r) => r.id);
  await db.auditLog.deleteMany({
    where: {
      OR: [
        { userId: { in: users } },
        { entityId: { in: [...ids, employeeId, otherId, categoryId] } },
      ],
    },
  });
  await db.verification.deleteMany({
    where: {
      OR: users.map((id) => ({
        identifier: { startsWith: "equipment-import:" + id + ":" },
      })),
    },
  });
  const accounts = await db.user.findMany({
    where: { id: { in: users } },
    select: { email: true },
  });
  await db.equipmentAssignment.deleteMany({
    where: { equipmentId: { in: ids } },
  });
  await db.equipment.deleteMany({ where: { id: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.employee.deleteMany({
    where: { id: { in: [employeeId, otherId] } },
  });
  await db.category.delete({ where: { id: categoryId } });
  await db.organization.delete({ where: { id: organizationId } });
  await db.rateLimit.deleteMany({
    where: {
      OR: [
        ...ips.map((ip) => ({ key: { startsWith: ip + "|" } })),
        {
          key: {
            in: accounts.map((u) =>
              createHash("sha256").update(u.email).digest("hex"),
            ),
          },
        },
      ],
    },
  });
  users.length = 0;
  ips.length = 0;
});
test.afterAll(async () => db.$disconnect());
test("ADMIN: equipment list, history, typed form, labels and scan", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page, "ADMIN");
  await page.goto("/equipment?categoryId=" + categoryId);
  await expect(
    page.getByRole("heading", { name: "Équipements", exact: true }),
  ).toBeVisible();
  await capture(page, "equipment-list", info.project.name);
  await page.goto("/equipment/" + itemId);
  await expect(
    page.getByRole("heading", { name: "Historique des mouvements" }),
  ).toBeVisible();
  await expect(
    page.getByText("Céline Lefèvre", { exact: true }).first(),
  ).toBeVisible();
  await capture(page, "equipment-detail", info.project.name);
  const pdf = await page.request.post("/api/equipment/certificate", {
    data: { assignmentIds: [assignmentId], kind: "handover" },
    headers: { origin: "http://localhost:3041" },
  });
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await page.goto("/equipment/" + stockId + "/edit");
  await expect(page.getByLabel("Mémoire vive (Go)")).toBeVisible();
  await capture(page, "equipment-form", info.project.name);
  await page
    .getByLabel("Désignation")
    .fill("Portable de réserve · Équipe support");
  await page.getByLabel("Mémoire vive (Go)").fill("64");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page).toHaveURL(new RegExp("/equipment/" + stockId + "$"));
  expect(
    (await db.equipment.findUniqueOrThrow({ where: { id: stockId } })).specs,
  ).toMatchObject({ ram: 64 });
  await page.goto("/scan");
  await expect(
    page.getByRole("button", { name: "Activer la caméra" }),
  ).toBeVisible();
  await capture(page, "scan", info.project.name);
  await page.goto("/references/categories");
  await expect(
    page.getByText("Portables " + batch, { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("listitem")
    .filter({ hasText: "Portables " + batch })
    .getByRole("button", { name: "Modifier", exact: true })
    .click();
  await page
    .getByLabel("Nom *", { exact: true })
    .fill("Portables révisés " + batch);
  await page.getByLabel("Désactivée", { exact: true }).first().check();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(
    page.getByText("Portables révisés " + batch, { exact: true }),
  ).toBeVisible();
  const category = await db.category.findUniqueOrThrow({
    where: { id: categoryId },
  });
  expect(category.specDefinitions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ key: "cpu", type: "text", disabled: true }),
    ]),
  );
  expect(errors).toEqual([]);
});
test("ADMIN: CSV errors and a successful confirmed import", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await signIn(page, "ADMIN");
  await page.goto("/equipment/import");
  const bytes = Buffer.from(
    "designation;categorie;prix_achat;site;statut;employe_email\nÉcran bureau;" +
      ("Portables " + batch) +
      ";1 299,90;Site introuvable;En stock;\nPortable prêt;" +
      ("Portables " + batch) +
      ";prix incorrect;;En prêt;absent@example.invalid",
  );
  await page.getByLabel("Fichier CSV").setInputFiles({
    name: "equipements-erreurs.csv",
    mimeType: "text/csv",
    buffer: bytes,
  });
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/equipment/import/preview") && r.ok(),
  );
  await page.getByRole("button", { name: "Analyser le fichier" }).click();
  const preview = await (await response).json();
  await expect(
    page.getByRole("heading", { name: "Aperçu de l’import" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirmer l’import" }),
  ).toHaveCount(0);
  await capture(page, "import-errors", info.project.name);
  mkdirSync("docs/examples", { recursive: true });
  writeFileSync("docs/examples/equipment-import-error.csv", bytes);
  writeFileSync(
    "docs/examples/equipment-import-preview-error.json",
    JSON.stringify(
      {
        encoding: preview.encoding,
        delimiter: preview.delimiter,
        rows: preview.rows,
        totals: preview.totals,
        hasErrors: preview.hasErrors,
      },
      null,
      2,
    ) + "\n",
  );
  const template = await page.request.get("/api/equipment/import/template");
  writeFileSync("docs/examples/equipment-template.csv", await template.body());
  const valid = Buffer.from(
    "designation;categorie;prix_achat;employe_email\nPortable importé;Portables " +
      batch +
      ";1 299,90;celine@" +
      batch +
      ".invalid",
  );
  await page.getByLabel("Fichier CSV").setInputFiles({
    name: "equipements.csv",
    mimeType: "text/csv",
    buffer: valid,
  });
  await page.getByRole("button", { name: "Analyser le fichier" }).click();
  await page.getByLabel("Je confirme les créations").check();
  await page.getByRole("button", { name: "Confirmer l’import" }).click();
  await expect(
    page.getByRole("heading", { name: "Import terminé" }),
  ).toBeVisible();
  const saved = await db.equipment.findFirstOrThrow({
    where: { categoryId, name: "Portable importé" },
  });
  expect(saved.purchasePrice?.toFixed(2)).toBe("1299.90");
  expect(saved.status).toBe("ASSIGNED");
});
test("TECHNICIAN: price redaction and assignment/return actions", async ({
  page,
}) => {
  test.setTimeout(120000);
  await signIn(page, "TECHNICIAN");
  const response = await page.request.get("/api/equipment/" + itemId);
  expect(response.ok()).toBe(true);
  expect(await response.json()).not.toHaveProperty("purchasePrice");
  expect((await page.request.get("/api/equipment/export")).status()).toBe(403);
  await page.goto("/equipment/" + stockId);
  await page
    .getByRole("combobox", { name: /Employé/ })
    .selectOption(employeeId);
  await expect(page.getByRole("combobox", { name: /Employé/ })).toHaveValue(
    employeeId,
  );
  await page.getByLabel("Type d’assignation").selectOption("LOAN");
  await page.getByLabel("Retour prévu *", { exact: true }).fill("2099-01-15");
  await page.getByRole("button", { name: "Confirmer l’assignation" }).click();
  await expect(
    page.getByRole("heading", { name: "Assignation en cours" }),
  ).toBeVisible();
  await page.getByLabel("État au retour *").selectOption("DAMAGED");
  await page.getByLabel("Je confirme la clôture").check();
  await page.getByRole("button", { name: "Enregistrer le retour" }).click();
  await expect(page.getByText("En réparation", { exact: true })).toBeVisible();
  await page.goto("/equipment/" + itemId + "/edit");
  await expect(page.getByLabel("Prix d’achat HT")).toHaveCount(0);
});
test("EMPLOYEE: own equipment only, no next-holder identity and forbidden scan", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await signIn(page, "EMPLOYEE");
  await page.goto("/my-equipment");
  await expect(
    page.getByRole("heading", { name: "Mon matériel", exact: true }),
  ).toBeVisible();
  await capture(page, "my-equipment", info.project.name);
  await page.goto("/equipment/" + itemId);
  await expect(page.getByText("Amine Perrin", { exact: true })).toHaveCount(0);
  expect((await page.request.get("/api/equipment/" + stockId)).status()).toBe(
    403,
  );
  await page.goto("/scan");
  await expect(page).toHaveURL(/\/forbidden$/);
  await page.goto("/equipment");
  await expect(page).toHaveURL(/\/forbidden$/);
});
