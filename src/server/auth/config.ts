import "server-only";
import { betterAuth } from "better-auth/minimal";
import type { BetterAuthOptions } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import type { PrismaClient } from "@/generated/prisma/client";
import { emailSchema, registrationSchema } from "@/lib/validation";
import { getDb } from "@/server/db";
import { getServerEnv, type ServerEnv } from "@/server/env";
import {
  assertMailConfigured,
  sendEmail,
  type EmailSender,
} from "@/server/mail";
import { writeAudit } from "@/server/services/audit";
import { unlinkAccount } from "@/server/services/accounts";
import { ServiceError } from "@/server/services/errors";
import {
  checkInvitation,
  reserveInvitation,
} from "@/server/services/invitations";
import {
  flowCookieOptions,
  invitationCookieName,
  linkCookieName,
  readFlowCookie,
  signFlowCookie,
} from "./flow-cookie";
import { authRateRules, consumeRateLimit, passwordRateKey } from "./rate-limit";
import { requireUser, type SessionReader } from "./require-user";

const protectedPaths = new Set([
  "/link-social",
  "/unlink-account",
  "/list-accounts",
]);
const publicPaths = new Set([
  "/sign-in/email",
  "/sign-up/email",
  "/sign-in/social",
  "/callback/:id",
  "/get-session",
  "/sign-out",
  "/send-verification-email",
  "/verify-email",
  "/request-password-reset",
  "/reset-password",
  "/reset-password/:token",
  "/error",
  "/ok",
]);
const credentialFailure = () =>
  new APIError("UNAUTHORIZED", {
    code: "INVALID_EMAIL_OR_PASSWORD",
    message: "Invalid email or password",
  });
function serviceError(error: unknown): APIError {
  if (isAPIError(error)) return error;
  if (error instanceof ServiceError) {
    if (error.code === "UNAUTHENTICATED") return credentialFailure();
    return new APIError(
      error.status === 403
        ? "FORBIDDEN"
        : error.status === 401
          ? "UNAUTHORIZED"
          : error.status === 503
            ? "SERVICE_UNAVAILABLE"
            : "BAD_REQUEST",
      { code: error.code, message: error.code },
    );
  }
  return new APIError("BAD_REQUEST", {
    code: "INVALID_REQUEST",
    message: "Invalid request",
  });
}

/** Dependencies can be supplied by integration tests; production uses the singleton below. */
export function createAuth(dependencies: {
  db: PrismaClient;
  env: ServerEnv;
  mail?: EmailSender;
  socialProviders?: BetterAuthOptions["socialProviders"];
}) {
  const { db, env } = dependencies;
  const mail = dependencies.mail ?? ((message) => sendEmail(message, env));
  const mailReady = () => {
    if (!dependencies.mail) assertMailConfigured(env);
  };
  let readSession: SessionReader = async () => {
    throw new Error("Auth initialization incomplete");
  };
  const authorize = (headers: Headers, fresh = false) =>
    requireUser({ headers, db, readSession, fresh });
  const cookieOptions = flowCookieOptions(env.BETTER_AUTH_URL);
  const failureAudit = () =>
    writeAudit(db, { action: "LOGIN_FAILED", entityType: "Authentication" });
  const configuredProviders: BetterAuthOptions["socialProviders"] = {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            prompt: "select_account",
            mapProfileToUser: (profile) => ({
              email: emailSchema.parse(profile.email),
              emailVerified: profile.email_verified === true,
              image: undefined,
            }),
          },
        }
      : {}),
    ...(env.MICROSOFT_CLIENT_ID &&
    env.MICROSOFT_CLIENT_SECRET &&
    env.MICROSOFT_TENANT_ID
      ? {
          microsoft: {
            clientId: env.MICROSOFT_CLIENT_ID,
            clientSecret: env.MICROSOFT_CLIENT_SECRET,
            tenantId: env.MICROSOFT_TENANT_ID,
            prompt: "select_account",
            disableProfilePhoto: true,
            disableDefaultScope: true,
            scope: ["openid", "profile", "email"],
            mapProfileToUser: (profile) => ({
              email: emailSchema.parse(profile.email),
              emailVerified: false,
              image: undefined,
            }),
          },
        }
      : {}),
  };
  const options = {
    appName: "Harnois",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [new URL(env.BETTER_AUTH_URL).origin],
    database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
    telemetry: { enabled: false },
    // Native messages sometimes include an email. Only our closed AuditLog payload is recorded.
    logger: { disabled: true },
    advanced: { ipAddress: { ipAddressHeaders: ["x-real-ip"] } },
    socialProviders: dependencies.socialProviders ?? configuredProviders,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: false,
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await mail({
          to: emailSchema.parse(user.email),
          template: "password-reset",
          url,
        });
      },
      onPasswordReset: async ({ user }) => {
        await writeAudit(db, {
          action: "PASSWORD_RESET",
          userId: user.id,
          entityType: "User",
          entityId: user.id,
        });
      },
    },
    emailVerification: {
      // An accepted invitation already proves the address. Never send a second message on signup.
      sendOnSignUp: false,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) => {
        await mail({
          to: emailSchema.parse(user.email),
          template: "verification",
          url,
        });
      },
    },
    user: {
      additionalFields: {
        role: {
          type: ["ADMIN", "IT_MANAGER", "TECHNICIAN", "EMPLOYEE"],
          required: true,
          defaultValue: "EMPLOYEE",
          input: false,
        },
        isActive: {
          type: "boolean",
          required: true,
          defaultValue: true,
          input: false,
        },
        employeeId: { type: "string", required: false, input: false },
        mfaEnforced: {
          type: "boolean",
          required: true,
          defaultValue: false,
          input: false,
        },
        lastLoginAt: { type: "date", required: false, input: false },
      },
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
      validateUserInfo: async ({ user, source }, ctx) => {
        const headers = ctx.headers ?? ctx.request?.headers ?? new Headers();
        const provider = source.oauth?.providerId;
        const invitationFlow = readFlowCookie(
          headers,
          invitationCookieName,
          env.BETTER_AUTH_SECRET,
        );
        if (provider && invitationFlow) {
          const invitation = await db.invitation.findUnique({
            where: { id: invitationFlow.id },
          });
          if (
            !invitation ||
            invitation.revokedAt ||
            invitation.acceptedAt ||
            invitation.expiresAt <= new Date()
          )
            return { error: "AUTHENTICATION_FAILED" };
          const incomingEmail = emailSchema.safeParse(user.email);
          if (
            !incomingEmail.success ||
            incomingEmail.data !== emailSchema.parse(invitation.email)
          )
            return { error: "INVITATION_EMAIL_MISMATCH" };
        }
        if (source.action === "link-account") {
          const flow = readFlowCookie(
            headers,
            linkCookieName,
            env.BETTER_AUTH_SECRET,
          );
          if (provider !== "google" || flow) {
            if (!flow || flow.provider !== provider || flow.id !== user.id)
              return { error: "AUTHENTICATION_FAILED" };
            try {
              const session = await authorize(headers, true);
              if (
                session.user.id !== flow.id ||
                session.session.id !== flow.sessionId
              )
                throw new Error();
            } catch {
              return { error: "AUTHENTICATION_FAILED" };
            }
          }
          // Even a purportedly verified Microsoft profile cannot bypass the explicit flow above.
          if (provider === "google" && user.emailVerified !== true)
            return { error: "AUTHENTICATION_FAILED" };
        }
        if (source.action === "create-user") {
          const flow = readFlowCookie(
            headers,
            invitationCookieName,
            env.BETTER_AUTH_SECRET,
          );
          if (!flow) return { error: "AUTHENTICATION_FAILED" };
          const invitation = await db.invitation.findUnique({
            where: { id: flow.id },
          });
          if (
            !invitation ||
            invitation.revokedAt ||
            invitation.acceptedAt ||
            invitation.expiresAt <= new Date()
          )
            return { error: "AUTHENTICATION_FAILED" };
          const email = emailSchema.safeParse(user.email);
          if (
            !email.success ||
            email.data !== emailSchema.parse(invitation.email)
          )
            return { error: "INVITATION_EMAIL_MISMATCH" };
          if (provider === "google" && user.emailVerified !== true)
            return { error: "AUTHENTICATION_FAILED" };
        }
      },
    },
    session: {
      expiresIn: 7 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      freshAge: 300,
      cookieCache: { enabled: false },
      additionalFields: {
        mfaVerifiedAt: { type: "date", required: false, input: false },
        mfaMethod: {
          type: ["TOTP", "WEBAUTHN", "RECOVERY_CODE"],
          required: false,
          input: false,
        },
      },
    },
    account: {
      updateAccountOnSignIn: false,
      accountLinking: {
        enabled: true,
        allowDifferentEmails: false,
        allowUnlinkingAll: false,
        updateUserInfoOnLink: false,
        // Microsoft is trusted ONLY for an explicit, signed link intent; validateUserInfo
        // additionally requires its still-valid, fresh session and the selected owner.
        trustedProviders: (request) =>
          readFlowCookie(
            request?.headers,
            linkCookieName,
            env.BETTER_AUTH_SECRET,
          )?.provider === "microsoft"
            ? ["microsoft"]
            : [],
      },
    },
    verification: { storeIdentifier: "hashed" },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 120,
      customRules: authRateRules,
    },
    onAPIError: { errorURL: "/login" },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const headers = ctx.headers ?? ctx.request?.headers ?? new Headers();
        try {
          if (!publicPaths.has(ctx.path) && !protectedPaths.has(ctx.path))
            throw new APIError("NOT_FOUND", {
              code: "NOT_FOUND",
              message: "Not found",
            });
          if (ctx.body && typeof ctx.body.email === "string")
            ctx.body.email = emailSchema.parse(ctx.body.email);
          const ownedFields =
            ctx.path === "/update-session"
              ? ["mfaVerifiedAt", "mfaMethod"]
              : [
                  "role",
                  "isActive",
                  "employeeId",
                  "mfaEnforced",
                  "lastLoginAt",
                ];
          if (
            ["/sign-up/email", "/update-user", "/update-session"].includes(
              ctx.path,
            ) &&
            ownedFields.some((field) => Object.hasOwn(ctx.body ?? {}, field))
          ) {
            throw new APIError("BAD_REQUEST", {
              code: "FIELD_NOT_ALLOWED",
              message: "Server-owned field",
            });
          }
          if (ctx.path === "/sign-up/email") {
            const flow = readFlowCookie(
              headers,
              invitationCookieName,
              env.BETTER_AUTH_SECRET,
            );
            ctx.setCookie(invitationCookieName, "", {
              ...cookieOptions,
              maxAge: 0,
            });
            if (!flow) throw new ServiceError("AUTHENTICATION_FAILED", 403);
            ctx.body = registrationSchema.parse(ctx.body);
            await checkInvitation(db, flow.id, ctx.body.email);
          }
          if (ctx.path === "/sign-in/email") {
            const email = emailSchema.parse(ctx.body?.email);
            // Reserve an in-flight attempt as a provisional failure to close parallel bypasses.
            if (!(await consumeRateLimit(db, passwordRateKey(email), 10, 900)))
              throw credentialFailure();
          }
          if (ctx.path === "/sign-in/social" || ctx.path === "/link-social") {
            ctx.body.callbackURL = "/profile/security";
            ctx.body.errorCallbackURL = "/login";
            ctx.body.newUserCallbackURL = "/profile/security";
          }
          if (
            ctx.path === "/request-password-reset" ||
            ctx.path === "/send-verification-email"
          )
            mailReady();
          if (protectedPaths.has(ctx.path)) {
            const session = await authorize(
              headers,
              ctx.path === "/link-social" || ctx.path === "/unlink-account",
            );
            if (ctx.path === "/unlink-account")
              return ctx.json(
                await unlinkAccount(db, session.user.id, ctx.body),
              );
            if (ctx.path === "/link-social") {
              const provider = ctx.body?.provider;
              if (provider !== "google" && provider !== "microsoft")
                throw new ServiceError("INVALID_PROVIDER");
              ctx.setCookie(
                linkCookieName,
                signFlowCookie(
                  {
                    id: session.user.id,
                    sessionId: session.session.id,
                    provider,
                  },
                  linkCookieName,
                  env.BETTER_AUTH_SECRET,
                ),
                cookieOptions,
              );
            }
          }
        } catch (error) {
          if (
            ctx.path === "/sign-in/email" ||
            ctx.path === "/sign-in/social" ||
            ctx.path === "/callback/:id"
          )
            await failureAudit();
          throw serviceError(error);
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/get-session") {
          const result = ctx.context.returned as {
            user?: { id?: string };
          } | null;
          if (result?.user?.id) {
            const user = await db.user.findUnique({
              where: { id: result.user.id },
              select: { isActive: true },
            });
            if (!user?.isActive) return ctx.json(null);
          }
        }
        if (ctx.path === "/sign-in/email") {
          if (ctx.context.newSession)
            await db.rateLimit.deleteMany({
              where: {
                key: passwordRateKey(emailSchema.parse(ctx.body?.email)),
              },
            });
          else await failureAudit();
        }
        if (ctx.path === "/sign-in/social" && isAPIError(ctx.context.returned))
          await failureAudit();
        if (ctx.path === "/callback/:id") {
          ctx.setCookie(invitationCookieName, "", {
            ...cookieOptions,
            maxAge: 0,
          });
          ctx.setCookie(linkCookieName, "", { ...cookieOptions, maxAge: 0 });
          const location = ctx.context.responseHeaders?.get("location");
          if (
            location &&
            new URL(location, env.BETTER_AUTH_URL).searchParams.has("error")
          )
            await failureAudit();
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            if (!ctx) throw new ServiceError("AUTHENTICATION_FAILED", 403);
            const flow = readFlowCookie(
              ctx.headers ?? ctx.request?.headers,
              invitationCookieName,
              env.BETTER_AUTH_SECRET,
            );
            ctx.setCookie(invitationCookieName, "", {
              ...cookieOptions,
              maxAge: 0,
            });
            if (!flow) throw new ServiceError("AUTHENTICATION_FAILED", 403);
            try {
              return {
                data: {
                  ...user,
                  ...(await reserveInvitation(db, flow.id, user.email)),
                },
              };
            } catch (error) {
              throw serviceError(error);
            }
          },
          after: async (user, ctx) => {
            const flow = readFlowCookie(
              ctx?.headers ?? ctx?.request?.headers,
              invitationCookieName,
              env.BETTER_AUTH_SECRET,
            );
            if (flow)
              await writeAudit(db, {
                action: "INVITATION_ACCEPTED",
                userId: user.id,
                entityType: "Invitation",
                entityId: flow.id,
              });
          },
        },
        update: {
          before: async (user) => ({
            data: {
              ...user,
              ...(user.email ? { email: emailSchema.parse(user.email) } : {}),
            },
          }),
        },
      },
      session: {
        create: {
          before: async (session) => {
            const user = await db.user.findUnique({
              where: { id: session.userId },
            });
            if (!user?.isActive || !user.emailVerified)
              throw credentialFailure();
            return {
              data: { ...session, mfaVerifiedAt: null, mfaMethod: null },
            };
          },
          after: async (session) => {
            await db.$transaction(async (tx) => {
              const user = await tx.user.update({
                where: { id: session.userId },
                data: { lastLoginAt: new Date() },
              });
              await tx.rateLimit.deleteMany({
                where: { key: passwordRateKey(user.email) },
              });
              await writeAudit(tx, {
                action: "LOGIN_SUCCEEDED",
                userId: session.userId,
                entityType: "User",
                entityId: session.userId,
              });
            });
          },
        },
      },
      account: {
        create: {
          // Login alone needs no retained OAuth API credentials.
          before: async (account) => ({
            data: {
              ...account,
              accessToken: null,
              refreshToken: null,
              idToken: null,
              accessTokenExpiresAt: null,
              refreshTokenExpiresAt: null,
            },
          }),
          after: async (account) => {
            await writeAudit(db, {
              action: "PROVIDER_LINKED",
              userId: account.userId,
              entityType: "Account",
              entityId: account.id,
              providerId: account.providerId,
            });
          },
        },
        update: {
          before: async (account) => ({
            data: {
              ...account,
              accessToken: null,
              refreshToken: null,
              idToken: null,
              accessTokenExpiresAt: null,
              refreshTokenExpiresAt: null,
            },
          }),
        },
      },
    },
  } satisfies BetterAuthOptions;
  const auth = betterAuth(options);
  readSession = (headers) =>
    auth.api.getSession({
      headers,
      query: { disableCookieCache: true, disableRefresh: true },
    });
  return auth;
}

let singleton: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return (singleton ??= createAuth({ db: getDb(), env: getServerEnv() }));
}
