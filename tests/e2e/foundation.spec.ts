import { randomUUID, createHash } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type UserRole } from "../../src/generated/prisma/client";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  log: [],
});
const password = "Foundation-browser-password-42";
const ids: string[] = [];
const auditIds: string[] = [];
const sessionIds: string[] = [];
let email: string;
let userId: string;
let ip: string;
let batch = "";
test.beforeEach(() => {
  batch = "p03-" + randomUUID().slice(0, 8);
});
async function user(role: UserRole, name: string, credential = false) {
  const person = await db.user.create({
    data: {
      email: `${batch}-${ids.length + 1}@example.invalid`,
      name,
      role,
      emailVerified: true,
    },
  });
  ids.push(person.id);
  if (credential)
    await db.account.create({
      data: {
        userId: person.id,
        accountId: person.id,
        providerId: "credential",
        password: await hashPassword(password),
      },
    });
  if (role !== "EMPLOYEE")
    await db.totpFactor.create({
      data: {
        userId: person.id,
        secretEncrypted: "fixture-not-decrypted",
        confirmedAt: new Date(),
      },
    });
  return person;
}
async function signIn(page: Page, role: UserRole) {
  const person = await user(role, "Camille Martin", true);
  email = person.email;
  userId = person.id;
  ip = `198.18.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200) + 1}`;
  await page.setExtraHTTPHeaders({ "x-real-ip": ip });
  const response = await page.request.post("/api/auth/sign-in/email", {
    headers: { origin: "http://localhost:3041", "x-real-ip": ip },
    data: { email, password },
  });
  expect(response.ok()).toBe(true);
  await db.session.updateMany({
    where: { userId },
    data: { mfaVerifiedAt: new Date(), mfaMethod: "TOTP" },
  });
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/auth/get-session") && response.ok(),
    ),
    page.goto("/profile"),
  ]);
}
async function overflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
async function theme(page: Page, value: "Clair" | "Sombre") {
  await page.getByRole("button", { name: "Menu utilisateur" }).click();
  await page.getByRole("menuitemradio", { name: value, exact: true }).click();
}
test.afterEach(async () => {
  await db.auditLog.deleteMany({
    where: {
      OR: [
        { id: { in: auditIds } },
        { userId: { in: ids } },
        { entityId: { in: ids } },
      ],
    },
  });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.verification.deleteMany({
    where: {
      OR: ids.map((id) => ({
        identifier: {
          startsWith: `mfa:${createHash("sha256").update(id).digest("hex")}:`,
        },
      })),
    },
  });
  if (email)
    await db.rateLimit.deleteMany({
      where: {
        OR: [
          { key: { startsWith: `${ip}|` } },
          { key: createHash("sha256").update(email).digest("hex") },
        ],
      },
    });
  ids.length = 0;
  auditIds.length = 0;
  sessionIds.length = 0;
});
test.afterAll(async () => {
  await db.$disconnect();
});
for (const role of ["ADMIN", "IT_MANAGER", "TECHNICIAN", "EMPLOYEE"] as const) {
  test(`${role}: navigation, page boundary and real API status`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.name));
    await signIn(page, role);
    await expect(
      page.getByRole("heading", { name: "Mon profil", exact: true }),
    ).toBeVisible();
    const nav = page.getByRole("navigation", {
      name:
        info.project.name === "mobile"
          ? "Navigation mobile"
          : "Navigation principale",
      exact: true,
    });
    if (role === "ADMIN" || role === "IT_MANAGER")
      await expect(
        nav.getByRole("link", {
          name: role === "ADMIN" ? "Administration" : "Gestion",
        }),
      ).toBeVisible();
    else
      await expect(
        nav.getByRole("link", { name: "Administration" }),
      ).toHaveCount(0);
    await expect(
      nav.getByRole("link", { name: "Équipements", exact: true }),
    ).toHaveCount(role === "EMPLOYEE" ? 0 : 1);
    for (const name of [
      "Logiciels",
      "Comptes",
      "Factures",
      "Tickets",
      "Checklists",
    ])
      await expect(nav.getByRole("link", { name, exact: true })).toHaveCount(0);
    await page.goto("/admin/users");
    if (role === "ADMIN")
      await expect(
        page.getByRole("heading", { name: "Utilisateurs", exact: true }),
      ).toBeVisible();
    else {
      await expect(page).toHaveURL(/\/forbidden$/);
      await expect(
        page.getByRole("heading", { name: "Accès refusé" }),
      ).toBeVisible();
    }
    const response = await page.request.get(
      "/api/admin/audit/export?userId=" + userId,
    );
    expect(response.status()).toBe(
      role === "ADMIN" || role === "IT_MANAGER" ? 200 : 403,
    );
    await page.goto("/admin/invitations");
    if (role === "IT_MANAGER") {
      await expect(page.locator("#invite-role option")).toHaveText([
        "Technicien",
        "Employé",
      ]);
      await expect(
        page
          .getByRole("navigation", { name: "Gestion", exact: true })
          .getByRole("link", { name: "Utilisateurs" }),
      ).toHaveCount(0);
    } else if (role !== "ADMIN") await expect(page).toHaveURL(/\/forbidden$/);
    await page.goto("/admin/ui");
    if (role !== "ADMIN") await expect(page).toHaveURL(/\/forbidden$/);
    await overflow(page);
    expect(errors).toEqual([]);
  });
}
test("ADMIN: users, filters, sessions, audit, themes and evidence", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.name));
  await signIn(page, "ADMIN");
  const target = await user("EMPLOYEE", "Alex Bernard");
  await user("TECHNICIAN", "Lou Petit");
  await user("IT_MANAGER", "Noa Laurent");
  const extra = await db.session.create({
    data: {
      userId,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 3600_000),
      lastSeenAt: new Date(),
      ipAddress: "192.0.2.14",
      userAgent: "Mozilla Windows Chrome/130",
    },
  });
  sessionIds.push(extra.id);
  const event = await db.auditLog.create({
    data: {
      userId,
      action: "USER_ROLE_CHANGED",
      entityType: "User",
      entityId: target.id,
      changes: {
        before: { role: "EMPLOYEE", passwordHash: "NEVER_RENDER" },
        after: { role: "TECHNICIAN" },
      },
    },
  });
  auditIds.push(event.id);
  for (const mode of ["Clair", "Sombre"] as const) {
    await theme(page, mode);
    await page.reload();
    expect(await page.locator("html").getAttribute("class")).toContain(
      mode === "Sombre" ? "dark" : "light",
    );
    for (const [route, name] of [
      ["/profile", "layout"],
      ["/admin/users?q=" + batch, "users"],
      [`/admin/users/${target.id}`, "user-detail"],
      ["/admin/audit?userId=" + userId, "audit"],
      ["/profile/security", "security"],
      ["/admin/ui", "ui"],
    ]) {
      await page.goto(route);
      await expect(page.locator("main h1")).toBeVisible();
      await overflow(page);
      await page.screenshot({
        path: `docs/screenshots/phase03/${name}-${info.project.name}-${mode === "Clair" ? "light" : "dark"}.png`,
        fullPage: true,
      });
    }
  }
  await page.goto("/admin/users");
  await page.getByRole("searchbox", { name: "Rechercher" }).fill(target.email);
  await expect(page).toHaveURL(/q=/);
  await expect(
    page.getByRole("status").filter({ hasText: "1 résultat" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("searchbox", { name: "Rechercher" })).toHaveValue(
    target.email,
  );
  await page
    .getByRole("combobox", { name: "Résultats par page" })
    .selectOption("10");
  await expect(page).toHaveURL(/pageSize=10/);
  await page.getByRole("button", { name: "Colonnes", exact: true }).click();
  await page
    .getByRole("menuitemcheckbox", { name: "Email", exact: true })
    .click();
  await expect(page).toHaveURL(/columns=/);
  await page.keyboard.press("Escape");
  await page.goto(`/admin/users/${target.id}`);
  await page
    .getByRole("combobox", { name: "Rôle", exact: true })
    .selectOption("TECHNICIAN");
  await page.getByRole("button", { name: "Enregistrer le rôle" }).click();
  await expect
    .poll(
      async () =>
        (await db.user.findUniqueOrThrow({ where: { id: target.id } })).role,
    )
    .toBe("TECHNICIAN");
  await page.getByRole("button", { name: "Désactiver le compte" }).click();
  await page.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await db.user.findUniqueOrThrow({ where: { id: target.id } }))
          .isActive,
    )
    .toBe(false);
  await page.goto("/profile/security");
  await page
    .getByRole("button", { name: "Révoquer les autres sessions" })
    .click();
  await page.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect
    .poll(async () => db.session.count({ where: { id: extra.id } }))
    .toBe(0);
  await page.goto(`/admin/audit/${event.id}`);
  await expect(
    page.getByText("Avant", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  expect(await page.getByRole("main").innerText()).not.toContain(
    "NEVER_RENDER",
  );
  await page.goto("/admin/audit?userId=" + userId);
  await page
    .getByRole("combobox", { name: "Action", exact: true })
    .selectOption("USER_ROLE_CHANGED");
  await page.getByRole("button", { name: "Filtrer", exact: true }).click();
  await expect(page).toHaveURL(/action=USER_ROLE_CHANGED/);
  await expect(
    page
      .getByRole("main")
      .getByText("Rôle modifié", { exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter la sélection" }).click();
  expect((await download).suggestedFilename()).toBe("harnois-audit.csv");
  await expect
    .poll(async () =>
      db.auditLog.count({ where: { userId, action: "AUDIT_EXPORTED" } }),
    )
    .toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
test("components: keyboard focus, sheet, validation, confirmation and French 404", async ({
  page,
}, info) => {
  await signIn(page, "ADMIN");
  await page.goto("/admin/ui");
  const trigger = page.getByRole("button", { name: "Ouvrir le panneau" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Formulaire en panneau" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Saisissez au moins deux caractères.",
  );
  await dialog.getByLabel("Libellé").fill("erreur");
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "L’action n’a pas abouti",
  );
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: "Ouvrir la confirmation" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.keyboard.press("Escape");
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "Plus", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Votre espace" })
      .getByRole("link", { name: "Sécurité", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Votre espace" }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(/\/profile\/security$/);
  } else {
    await page.getByRole("button", { name: "Replier la navigation" }).click();
    await expect(
      page.getByRole("button", { name: "Déplier la navigation" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Déplier la navigation" }).click();
  }
  await page.goto("/unknown-foundation-path");
  await expect(
    page.getByRole("heading", { name: "Page introuvable" }),
  ).toBeVisible();
});
