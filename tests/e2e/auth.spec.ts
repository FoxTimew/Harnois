import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

// playwright.config loads and validates harnois_test before this module runs.
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  log: [],
});
const password = "Browser-test-password-42";
let email: string;
let token: string;
let invitationId: string;
let ip: string;
test.beforeEach(async ({ page }) => {
  email = `e2e-${randomUUID()}@example.invalid`;
  ip = `198.18.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
  token = randomBytes(32).toString("base64url");
  const invitation = await db.invitation.create({
    data: {
      email,
      role: "EMPLOYEE",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 600_000),
    },
  });
  invitationId = invitation.id;
  await page.setExtraHTTPHeaders({ "x-real-ip": ip });
});
test.afterEach(async () => {
  if (!email || !invitationId || !ip) return;
  const users = await db.user.findMany({
    where: { email },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);
  await db.auditLog.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { entityId: invitationId }] },
  });
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.account.deleteMany({ where: { userId: { in: ids } } });
  await db.invitation.deleteMany({ where: { id: invitationId } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.rateLimit.deleteMany({
    where: {
      OR: [
        { key: { startsWith: `${ip}|` } },
        { key: createHash("sha256").update(email).digest("hex") },
        {
          key: `invitation-prepare:${createHash("sha256").update(ip).digest("hex")}`,
        },
      ],
    },
  });
});
test.afterAll(async () => {
  await db.$disconnect();
});
test("invitation, login, security and logout work without overflow", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.name));
  const response = await page.goto(`/invitation/${token}`);
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(
    page.getByRole("heading", { name: "Bienvenue dans l’équipe." }),
  ).toBeVisible();
  await page.getByLabel("Votre nom").fill("Camille Démo");
  await page.getByLabel("Choisissez un mot de passe").fill(password);
  await page.getByRole("button", { name: "Activer mon accès" }).click();
  await expect(page).toHaveURL(/\/login\?registered=1$/);
  await page.screenshot({
    path: info.outputPath(`login-${info.project.name}.png`),
    fullPage: true,
  });
  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/profile\/security$/);
  await expect(
    page.getByRole("heading", { name: "Méthodes de connexion" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Délier" })).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath(`security-${info.project.name}.png`),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Déconnexion" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/profile/security");
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});
test("admin invitation form is protected by role and displays delivery failures", async ({
  page,
}, info) => {
  const user = await db.user.create({
    data: { email, name: "Admin Démo", emailVerified: true, role: "ADMIN" },
  });
  await db.account.create({
    data: {
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await hashPassword(password),
    },
  });
  await page.goto("/login");
  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/profile\/security$/);
  await page.getByRole("link", { name: "Invitations", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Inviter une personne" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath(`invitations-${info.project.name}.png`),
    fullPage: true,
  });
  await page.getByLabel("Adresse email").fill("invited@example.invalid");
  await page.getByRole("button", { name: "Envoyer l’invitation" }).click();
  await expect(
    page.getByText(
      "L’envoi d’emails est temporairement indisponible. Contactez votre administrateur.",
    ),
  ).toBeVisible();
  await db.user.update({ where: { id: user.id }, data: { role: "EMPLOYEE" } });
  await page.getByLabel("Adresse email").fill("invited@example.invalid");
  await page.getByRole("button", { name: "Envoyer l’invitation" }).click();
  await expect(
    page.getByText("Vous n’avez pas les droits nécessaires."),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Accès non autorisé" }),
  ).toBeVisible();
});
test("public recovery pages work and invalid invitations remain neutral", async ({
  page,
}) => {
  for (const route of [
    "/forgot-password",
    "/verify-email",
    "/reset-password",
    "/invitation/invalid",
  ]) {
    await page.goto(route);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator("h1")).toBeVisible();
  }
  await expect(
    page.getByText("Demandez une nouvelle invitation à votre administrateur."),
  ).toBeVisible();
});
