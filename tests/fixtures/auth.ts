import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { BetterAuthOptions } from "better-auth";
import type { PrismaClient, UserRole } from "@/generated/prisma/client";
import { createAuth } from "@/server/auth/config";
import { handleAuthRequest } from "@/server/auth/http";
import {
  invitationCookieName,
  signFlowCookie,
} from "@/server/auth/flow-cookie";
import { passwordRateKey, privateRateKey } from "@/server/auth/rate-limit";
import { mfaNamespace } from "@/server/auth/mfa-policy";
import { getDb } from "@/server/db";
import { parseServerEnv } from "@/server/env";
import type { EmailMessage } from "@/server/mail";
import { invitationTokenHash } from "@/server/services/invitations";

export const testPassword = "Correct-test-password-42";
let counter = 1;
export function responseCookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .filter((value) => !value.endsWith("="))
    .join("; ");
}
export function authFixture(
  providers?: BetterAuthOptions["socialProviders"],
  enableOAuth = false,
) {
  const original = getDb();
  const records = new Map<string, Set<string>>();
  const emails = new Set<string>();
  const messages: EmailMessage[] = [];
  let failUserCreation = false;
  const db = original.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (failUserCreation && model === "User" && operation === "create")
            throw new Error("Injected user creation failure");
          const result = await query(args);
          if (
            operation === "create" &&
            result &&
            typeof result === "object" &&
            "id" in result &&
            typeof result.id === "string"
          ) {
            if (!records.has(model)) records.set(model, new Set());
            records.get(model)!.add(result.id);
          }
          return result;
        },
      },
    },
  }) as unknown as PrismaClient;
  const index = counter++;
  const ip = `198.18.${Math.floor(index / 250)}.${(index % 250) + 1}`;
  const env = parseServerEnv({
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: "harnois-integration-only-secret-32-characters",
    BETTER_AUTH_URL: "http://localhost:3000",
    ENCRYPTION_KEY: "ab".repeat(32),
    ...(enableOAuth
      ? {
          GOOGLE_CLIENT_ID: "harnois-test-google",
          GOOGLE_CLIENT_SECRET: "test-only-client-secret",
          MICROSOFT_CLIENT_ID: "harnois-test-microsoft",
          MICROSOFT_CLIENT_SECRET: "test-only-client-secret",
          MICROSOFT_TENANT_ID: "123e4567-e89b-42d3-a456-426614174000",
        }
      : {}),
  });
  const auth = createAuth({
    db,
    env,
    socialProviders: providers,
    mail: async (message) => {
      messages.push(message);
    },
  });
  const email = () => {
    const value = `${randomUUID()}@example.invalid`;
    emails.add(value);
    return value;
  };
  const request = (
    path: string,
    body?: Record<string, unknown>,
    cookie?: string,
    method?: string,
  ) => {
    if (typeof body?.email === "string")
      emails.add(body.email.trim().toLowerCase());
    return new Request(`${env.BETTER_AUTH_URL}/api/auth${path}`, {
      method: method ?? (body ? "POST" : "GET"),
      headers: {
        origin: env.BETTER_AUTH_URL,
        "x-real-ip": ip,
        ...(body ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  };
  return {
    db,
    auth,
    env,
    messages,
    ip,
    email,
    request,
    records,
    failCreation() {
      failUserCreation = true;
    },
    send(
      path: string,
      body?: Record<string, unknown>,
      cookie?: string,
      method?: string,
    ) {
      return handleAuthRequest(request(path, body, cookie, method), auth);
    },
    async user(role: UserRole = "EMPLOYEE", password = true) {
      const user = await db.user.create({
        data: { email: email(), name: "Test", emailVerified: true, role },
      });
      if (password)
        await db.account.create({
          data: {
            userId: user.id,
            providerId: "credential",
            accountId: user.id,
            password: await hashPassword(testPassword),
          },
        });
      return user;
    },
    async invitation(
      options: {
        email?: string;
        role?: UserRole;
        employeeId?: string;
        acceptedAt?: Date;
        revokedAt?: Date;
        expiresAt?: Date;
      } = {},
    ) {
      const token = Buffer.from(randomUUID().replaceAll("-", "")).toString(
        "base64url",
      );
      const address = options.email ?? email();
      emails.add(address.trim().toLowerCase());
      const invitation = await db.invitation.create({
        data: {
          ...options,
          email: address,
          role: options.role ?? "EMPLOYEE",
          tokenHash: invitationTokenHash(token),
          expiresAt: options.expiresAt ?? new Date(Date.now() + 60_000),
        },
      });
      return {
        invitation,
        token,
        cookie: `${invitationCookieName}=${signFlowCookie({ id: invitation.id }, invitationCookieName, env.BETTER_AUTH_SECRET)}`,
      };
    },
    async cleanup() {
      const ids = (model: string) => [...(records.get(model) ?? [])];
      // Every ID is captured by a Prisma query observer; no truncation or broad deletion.
      await original.auditLog.deleteMany({
        where: { id: { in: ids("AuditLog") } },
      });
      await original.session.deleteMany({
        where: {
          OR: [{ id: { in: ids("Session") } }, { userId: { in: ids("User") } }],
        },
      });
      await original.account.deleteMany({
        where: {
          OR: [{ id: { in: ids("Account") } }, { userId: { in: ids("User") } }],
        },
      });
      await original.invitation.deleteMany({
        where: { id: { in: ids("Invitation") } },
      });
      await original.equipmentAssignment.deleteMany({
        where: { id: { in: ids("EquipmentAssignment") } },
      });
      await original.equipment.deleteMany({
        where: { id: { in: ids("Equipment") } },
      });
      await original.category.deleteMany({
        where: { id: { in: ids("Category") } },
      });
      await original.supplier.deleteMany({
        where: { id: { in: ids("Supplier") } },
      });
      await original.user.deleteMany({ where: { id: { in: ids("User") } } });
      await original.employee.deleteMany({
        where: { id: { in: ids("Employee") } },
      });
      await original.department.deleteMany({
        where: { id: { in: ids("Department") } },
      });
      await original.organization.deleteMany({
        where: { id: { in: ids("Organization") } },
      });
      await original.location.deleteMany({
        where: { id: { in: ids("Location") } },
      });
      await original.verification.deleteMany({
        where: { id: { in: ids("Verification") } },
      });
      await original.rateLimit.deleteMany({
        where: {
          OR: [
            { id: { in: ids("RateLimit") } },
            ...ids("User").map((id) => ({
              key: { startsWith: mfaNamespace(id) },
            })),
            { key: { startsWith: `${ip}|` } },
            {
              key: {
                in: [...emails]
                  .map(passwordRateKey)
                  .concat(privateRateKey("invitation-prepare", ip)),
              },
            },
          ],
        },
      });
    },
  };
}
export type AuthFixture = ReturnType<typeof authFixture>;
