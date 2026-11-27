import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { generate } from "otplib";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  log: [],
});
const password = "Browser-mfa-password-42";
let userId: string;
let email: string;
let ip: string;
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test.beforeEach(async ({ page }) => {
  email = `mfa-${randomUUID()}@example.invalid`;
  ip = `198.19.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
  const user = await db.user.create({
    data: { email, name: "Camille Démo", emailVerified: true, role: "ADMIN" },
  });
  userId = user.id;
  await db.account.create({
    data: {
      userId,
      accountId: userId,
      providerId: "credential",
      password: await hashPassword(password),
    },
  });
  await page.setExtraHTTPHeaders({ "x-real-ip": ip });
});
test.afterEach(async () => {
  const namespace = `mfa:${createHash("sha256").update(userId).digest("hex")}:`;
  await db.auditLog.deleteMany({
    where: { OR: [{ userId }, { entityId: userId }] },
  });
  await db.verification.deleteMany({
    where: { identifier: { startsWith: namespace } },
  });
  await db.rateLimit.deleteMany({
    where: {
      OR: [
        { key: { startsWith: namespace } },
        { key: { startsWith: `${ip}|` } },
        { key: createHash("sha256").update(email).digest("hex") },
      ],
    },
  });
  await db.user.delete({ where: { id: userId } });
});
test.afterAll(async () => {
  await db.$disconnect();
});

test("forced WebAuthn setup, login verification, second key and removal", async ({
  page,
  context,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.name));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "usb",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  );
  await login(page);
  await expect(page).toHaveURL(/\/mfa\/setup/);
  await expect(
    page.getByRole("heading", { name: "Protégez votre compte." }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `docs/screenshots/phase02/setup-${info.project.name}.png`,
    fullPage: true,
  });
  await page.goto("/admin/invitations");
  await expect(page).toHaveURL(/\/mfa\/setup\?returnTo=%2Fadmin%2Finvitations/);
  await page
    .getByRole("button", { name: /Clé de sécurité ou téléphone/ })
    .click();
  await page.getByLabel("Nom de la clé").fill("Clé principale");
  await page.getByRole("button", { name: "Enregistrer la clé" }).click();
  await expect(
    page.getByRole("heading", { name: "Conservez vos codes de secours" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Conservez vos codes de secours" })
      .getByRole("listitem"),
  ).toHaveCount(10);
  await page.getByLabel("J’ai conservé mes codes de secours.").check();
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/invitations$/);
  await page.getByRole("button", { name: "Menu utilisateur" }).click();
  await page.getByRole("menuitem", { name: "Déconnexion" }).click();
  await login(page);
  await expect(page).toHaveURL(/\/mfa\/verify/);
  await expect(
    page.getByRole("heading", { name: "Vérifiez votre identité." }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `docs/screenshots/phase02/verify-${info.project.name}.png`,
    fullPage: true,
  });
  await page.goto("/admin/invitations");
  await expect(page).toHaveURL(
    /\/mfa\/verify\?returnTo=%2Fadmin%2Finvitations/,
  );
  await page
    .getByRole("button", { name: "Utiliser ma clé", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/invitations$/);
  await page.goto("/profile/security");
  await expect(page.getByText("Clé principale", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Supprimer", exact: true }),
  ).toBeDisabled();
  await noOverflow(page);
  await page.screenshot({
    path: `docs/screenshots/phase02/security-${info.project.name}.png`,
    fullPage: true,
  });
  await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "usb",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.getByRole("button", { name: "Ajouter un facteur" }).click();
  await page
    .getByRole("button", { name: /Clé de sécurité ou téléphone/ })
    .click();
  await page.getByLabel("Nom de la clé").fill("Clé de secours");
  await page.getByRole("button", { name: "Enregistrer la clé" }).click();
  await expect(page.getByText("Clé de secours", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Supprimer", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(page.getByText("Clé principale", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Supprimer", exact: true }),
  ).toBeDisabled();
  await db.session.updateMany({
    where: { userId },
    data: { mfaVerifiedAt: new Date(Date.now() - 601_000) },
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Confirmez votre identité" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Utiliser ma clé", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Confirmez votre identité" }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("TOTP setup, recovery login, low-code warning and regeneration", async ({
  page,
}) => {
  await login(page);
  await expect(page).toHaveURL(/\/mfa\/setup/);
  await page
    .getByRole("button", { name: /Application d’authentification/ })
    .click();
  await page.getByText("Saisir la clé manuellement").click();
  const secret = await page.locator("code").textContent();
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await page
    .getByLabel("Code à 6 chiffres")
    .fill(await generate({ secret: secret! }));
  await page.getByRole("button", { name: "Activer l’application" }).click();
  await expect(
    page
      .getByRole("region", { name: "Conservez vos codes de secours" })
      .getByRole("listitem"),
  ).toHaveCount(10);
  const codes = await page
    .getByRole("region", { name: "Conservez vos codes de secours" })
    .getByRole("listitem")
    .allTextContents();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Télécharger" }).click();
  expect((await download).suggestedFilename()).toBe(
    "harnois-codes-de-secours.txt",
  );
  await page.getByLabel("J’ai conservé mes codes de secours.").check();
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await expect(page).toHaveURL(/\/profile\/security$/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Conservez vos codes de secours" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Menu utilisateur" }).click();
  await page.getByRole("menuitem", { name: "Déconnexion" }).click();
  await login(page);
  await expect(page).toHaveURL(/\/mfa\/verify/);
  await page
    .getByRole("button", { name: "Utiliser un code de secours" })
    .click();
  await page
    .getByLabel("Code de secours", { exact: true })
    .fill(codes[0].toLowerCase().replaceAll("-", " "));
  await page.getByRole("button", { name: "Vérifier", exact: true }).click();
  await expect(page).toHaveURL(/\/profile\/security$/);
  for (const code of codes.slice(1, 7))
    expect(
      (
        await page.request.post("/api/mfa/recovery/verify", {
          data: { code },
          headers: { origin: "http://localhost:3041" },
        })
      ).ok(),
    ).toBe(true);
  await page.reload();
  await expect(page.getByText("3 code(s) disponible(s).")).toBeVisible();
  await expect(page.getByText(/Il vous reste peu de codes/)).toBeVisible();
  await page.getByRole("button", { name: "Régénérer les codes" }).click();
  await page.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Conservez vos codes de secours" })
      .getByRole("listitem"),
  ).toHaveCount(10);
  const oldCode = await page.request.post("/api/mfa/recovery/verify", {
    data: { code: codes[9] },
    headers: { origin: "http://localhost:3041" },
  });
  expect(oldCode.status()).toBe(400);
  await noOverflow(page);
});

test("promotion blocks public pages and Server Actions at the next request", async ({
  page,
}) => {
  await db.user.update({ where: { id: userId }, data: { role: "EMPLOYEE" } });
  await login(page);
  await expect(page).toHaveURL(/\/profile\/security$/);
  await db.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
  await page.goto("/");
  await expect(page).toHaveURL(/\/mfa\/setup/);
  await page.goto("/forgot-password");
  await expect(page).toHaveURL(/\/mfa\/setup/);
  expect(
    (
      await page.request.post("/api/auth/change-password", {
        data: { currentPassword: password, newPassword: password },
        headers: { origin: "http://localhost:3041" },
      })
    ).status(),
  ).toBe(403);
});
