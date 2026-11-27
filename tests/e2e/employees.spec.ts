import { randomUUID, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type UserRole } from "../../src/generated/prisma/client";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  log: [],
});
const password = "Employee-browser-password-42";
let batch: string,
  orgId: string,
  deptId: string,
  locationId: string,
  employeeId: string;
const users: string[] = [];
let ip: string;
test.beforeEach(async () => {
  batch = "p04-" + randomUUID().slice(0, 8);
  const org = await db.organization.create({
    data: { name: batch + " · Atelier Harnois" },
  });
  orgId = org.id;
  const dept = await db.department.create({
    data: { name: "Support", organizationId: org.id },
  });
  deptId = dept.id;
  const location = await db.location.create({
    data: { name: batch + " · Paris", city: "Paris" },
  });
  locationId = location.id;
  const row = await db.employee.create({
    data: {
      email: "celine@" + batch + ".invalid",
      firstName: "Céline",
      lastName: "Lefèvre",
      phone: "+33612345678",
      startDate: new Date("2025-01-15"),
      jobTitle: "Responsable support",
      status: "ACTIVE",
      searchText: "celine lefevre celine@" + batch + ".invalid",
      organizationId: orgId,
      departmentId: deptId,
      locationId,
    },
  });
  employeeId = row.id;
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
  ip =
    "198.19." +
    Math.floor(Math.random() * 200) +
    "." +
    (1 + Math.floor(Math.random() * 200));
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
  return user;
}
async function screenshot(page: Page, name: string, project: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "docs/screenshots/phase04/" + name + "-" + project + ".png",
    fullPage: true,
  });
}
test.afterEach(async () => {
  const employees = await db.employee.findMany({
    where: { email: { endsWith: "@" + batch + ".invalid" } },
    select: { id: true },
  });
  const refs = await db.organization.findMany({
    where: { name: { startsWith: batch } },
    select: { id: true },
  });
  const departments = await db.department.findMany({
    where: { organizationId: { in: refs.map((row) => row.id) } },
    select: { id: true },
  });
  const locations = await db.location.findMany({
    where: { name: { startsWith: batch } },
    select: { id: true },
  });
  const ids = [...employees, ...refs, ...departments, ...locations].map(
    (row) => row.id,
  );
  await db.auditLog.deleteMany({
    where: {
      OR: [{ userId: { in: users } }, { entityId: { in: [...ids, ...users] } }],
    },
  });
  await db.verification.deleteMany({
    where: {
      OR: users.flatMap((id) => [
        { identifier: { startsWith: "employee-import:" + id + ":" } },
        {
          identifier: {
            startsWith:
              "mfa:" + createHash("sha256").update(id).digest("hex") + ":",
          },
        },
      ]),
    },
  });
  const accounts = await db.user.findMany({
    where: { id: { in: users } },
    select: { email: true },
  });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.employee.deleteMany({
    where: { id: { in: employees.map((row) => row.id) } },
  });
  await db.department.deleteMany({
    where: { id: { in: departments.map((row) => row.id) } },
  });
  await db.organization.deleteMany({
    where: { id: { in: refs.map((row) => row.id) } },
  });
  await db.location.deleteMany({
    where: { id: { in: locations.map((row) => row.id) } },
  });
  await db.rateLimit.deleteMany({
    where: {
      OR: [
        { key: { startsWith: ip + "|" } },
        {
          key: {
            in: accounts.map((row) =>
              createHash("sha256").update(row.email).digest("hex"),
            ),
          },
        },
      ],
    },
  });
  users.length = 0;
});
test.afterAll(async () => {
  await db.$disconnect();
});
test("ADMIN: employee search, detail, departure, references and account warning", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page, "ADMIN");
  await page.goto("/employees?organizationId=" + orgId + "&q=celine");
  await expect(
    page.getByRole("heading", { name: "Employés", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("link", { name: "Céline Lefèvre", exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await screenshot(page, "employees", info.project.name);
  await page.goto("/employees/" + employeeId);
  await expect(
    page.getByRole("heading", { name: "Céline Lefèvre" }),
  ).toBeVisible();
  await screenshot(page, "employee-detail", info.project.name);
  await page.getByRole("link", { name: "Inviter dans Harnois" }).click();
  await expect(page.locator("#invite-email")).toHaveValue(
    "celine@" + batch + ".invalid",
  );
  const linked = await db.user.create({
    data: {
      name: "Céline Lefèvre",
      email: "linked@" + batch + ".invalid",
    },
  });
  users.push(linked.id);
  await page.goto("/employees/" + employeeId);
  await page
    .getByLabel("Compte sans employé lié", { exact: true })
    .selectOption(linked.id);
  await page
    .getByRole("button", { name: "Lier le compte", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Gérer le compte Céline Lefèvre" }),
  ).toBeVisible();
  await page.goto("/employees/" + employeeId + "/edit");
  await page.getByLabel("Statut", { exact: true }).selectOption("LEFT");
  await page.getByLabel("Date de départ", { exact: true }).fill("2026-01-01");
  await expect(
    page.getByRole("button", { name: "Enregistrer", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Départ immédiat, sans phase de préparation", { exact: true })
    .check();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page).toHaveURL(new RegExp("/employees/" + employeeId + "$"));
  await page.goto("/admin/users");
  await expect(
    page.getByRole("status", { name: "Comptes à désactiver" }),
  ).toContainText("Céline");
  await screenshot(page, "departed-accounts", info.project.name);
  await page.goto("/references/departments");
  await expect(
    page
      .getByRole("link", { name: "Référentiels", exact: true })
      .filter({ visible: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "Référentiels", exact: true }),
  ).toBeVisible();
  await screenshot(page, "references", info.project.name);
  await page
    .getByRole("button", { name: "Supprimer Support", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "employé(s)" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("IT_MANAGER: creates an employee and manages an unused reference", async ({
  page,
}) => {
  await signIn(page, "IT_MANAGER");
  await page.goto("/employees/new");
  await page.getByLabel("Prénom *", { exact: true }).fill("Élodie");
  await page.getByLabel("Nom *", { exact: true }).fill("Martin");
  await page
    .getByLabel("Email professionnel *", { exact: true })
    .fill("elodie@" + batch + ".invalid");
  await page
    .getByLabel("Téléphone international", { exact: true })
    .fill("+33 6 12 34 56 78");
  await page.getByLabel(/^Pôle/).selectOption(deptId);
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Élodie Martin", exact: true }),
  ).toBeVisible();
  const created = await db.employee.findUniqueOrThrow({
    where: { email: "elodie@" + batch + ".invalid" },
  });
  expect(created.organizationId).toBe(orgId);
  expect(created.phone).toBe("+33612345678");
  await expect(
    page.getByRole("button", { name: "Lier le compte", exact: true }),
  ).toHaveCount(0);
  await page.goto("/references/organizations");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Nom *", { exact: true })
    .fill(batch + " temporaire");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: batch + " temporaire",
      exact: true,
      includeHidden: true,
    }),
  ).toBeAttached();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", {
      name: "Modifier " + batch + " temporaire",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Nom *", { exact: true })
    .fill(batch + " renommée");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: batch + " renommée",
      exact: true,
      includeHidden: true,
    }),
  ).toBeAttached();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", {
      name: "Supprimer " + batch + " renommée",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: batch + " renommée", exact: true }),
  ).toHaveCount(0);
});
test("ADMIN: import errors, approved references and same-file manager", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await signIn(page, "ADMIN");
  await page.goto("/employees/import");
  const invalid = Buffer.from(
    "email;prenom;nom;statut;site\nlea@" +
      batch +
      ".invalid;Léa;Morel;En arrivée;Site inconnu\namine@" +
      batch +
      ".invalid;Amine;Perrin;incorrect;\nelodie@" +
      batch +
      ".invalid;Élodie;Martin;Actif;",
  );
  await page.getByLabel("Fichier CSV").setInputFiles({
    name: "employes.csv",
    mimeType: "text/csv",
    buffer: invalid,
  });
  const previewResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/employees/import/preview") && response.ok(),
  );
  await page.getByRole("button", { name: "Afficher l’aperçu" }).click();
  const previewEvidence = await (await previewResponse).json();
  writeFileSync("docs/examples/employee-import-error.csv", invalid);
  writeFileSync(
    "docs/examples/employee-import-preview-error.json",
    JSON.stringify(
      {
        encoding: previewEvidence.encoding,
        delimiter: previewEvidence.delimiter,
        rows: previewEvidence.rows,
        totals: previewEvidence.totals,
        hasErrors: previewEvidence.hasErrors,
      },
      null,
      2,
    ) + "\n",
  );
  await expect(
    page.getByRole("heading", { name: "Aperçu de l’import" }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "ligne(s) à corriger" }),
  ).toContainText("2 ligne(s)");
  await expect(
    page.getByRole("button", { name: "Confirmer l’import" }),
  ).toHaveCount(0);
  await screenshot(page, "import-errors", info.project.name);
  const valid = Buffer.from(
    "email;prenom;nom;statut;organisation;pole;manager_email\nlea@" +
      batch +
      ".invalid;Léa;Morel;En arrivée;" +
      batch +
      " Services;Opérations;amine@" +
      batch +
      ".invalid\namine@" +
      batch +
      ".invalid;Amine;Perrin;Actif;" +
      batch +
      " Services;Opérations;",
  );
  await page.getByLabel("Fichier CSV").setInputFiles({
    name: "employes.csv",
    mimeType: "text/csv",
    buffer: valid,
  });
  await page.getByRole("button", { name: "Afficher l’aperçu" }).click();
  await expect(
    page.getByRole("heading", { name: "Référentiels à créer" }),
  ).toBeVisible();
  for (const checkbox of await page.getByRole("checkbox").all())
    await checkbox.check();
  await page.getByRole("button", { name: "Confirmer l’import" }).click();
  await expect(
    page.getByRole("heading", { name: "Import terminé" }),
  ).toBeVisible();
  const report = await db.employee.findUniqueOrThrow({
    where: { email: "lea@" + batch + ".invalid" },
  });
  const manager = await db.employee.findUniqueOrThrow({
    where: { email: "amine@" + batch + ".invalid" },
  });
  expect(report.managerId).toBe(manager.id);
});
test("TECHNICIAN: professional read-only view and sensitive response redaction", async ({
  page,
}) => {
  await signIn(page, "TECHNICIAN");
  const response = await page.goto("/employees/" + employeeId);
  expect(await response!.text()).not.toContain("+33612345678");
  await expect(page.getByText("Téléphone", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Modifier la fiche" }),
  ).toHaveCount(0);
  await page.goto("/employees/" + employeeId + "/edit");
  await expect(page).toHaveURL(/\/forbidden$/);
  expect((await page.request.get("/api/employees/export")).status()).toBe(403);
  expect(
    (await page.request.get("/api/employees/import/template")).status(),
  ).toBe(403);
});
test("EMPLOYEE: own record and personal menu only", async ({ page }) => {
  await signIn(page, "EMPLOYEE");
  await page.goto("/profile");
  await page.getByRole("button", { name: "Menu utilisateur" }).click();
  await page.getByRole("menuitem", { name: "Ma fiche", exact: true }).click();
  await expect(page).toHaveURL(new RegExp("/employees/" + employeeId + "$"));
  await expect(page.getByText("+33612345678", { exact: true })).toBeVisible();
  await page.goto("/employees");
  await expect(page).toHaveURL(/\/forbidden$/);
  await page.goto("/employees/unknown-record");
  await expect(page).toHaveURL(/\/forbidden$/);
});
