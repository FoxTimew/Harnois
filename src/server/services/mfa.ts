import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { generateSecret, generateURI, verify as verifyTotp } from "otplib";
import QRCode from "qrcode";
import { verifyPassword } from "better-auth/crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransport,
} from "@simplewebauthn/server";
import type {
  Prisma,
  PrismaClient,
  MfaMethod,
} from "@/generated/prisma/client";
import {
  authenticationSchema,
  emptySchema,
  keyNameSchema,
  primaryProofSchema,
  recoveryCodeSchema,
  registrationSchema,
  removeFactorSchema,
  resetMfaSchema,
  totpCodeSchema,
} from "@/lib/mfa-validation";
import { emailSchema } from "@/lib/validation";
import {
  assertMfaAccess,
  loadMfaContext,
  mfaNamespace,
  primaryIdentifier,
  recentWindow,
  type MfaAccess,
  type MfaContext,
} from "@/server/auth/mfa-policy";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  matchesRecoveryCode,
} from "@/server/auth/recovery-codes";
import { encryptSecret, decryptSecret } from "@/server/crypto";
import { getDb } from "@/server/db";
import { getServerEnv, type ServerEnv } from "@/server/env";
import { sendEmail, type EmailSender } from "@/server/mail";
import type { SecurityNotice } from "@/server/mail/templates";
import { writeAudit } from "./audit";
import { ServiceError } from "./errors";

type Tx = Prisma.TransactionClient;
export type MfaActor = { userId: string; sessionId: string; ip?: string };
type Notification = {
  userId: string;
  email: string;
  event: SecurityNotice["event"];
};
type Result<T> = { data: T; notification?: Notification } | { error: MfaError };
type Method = MfaMethod | "PASSWORD";
const anyState = ["setup", "verify", "ready"] as const;
const enrollAccess: MfaAccess = { states: ["setup", "ready"], fresh: true };
const verifyAccess: MfaAccess = { states: ["verify", "ready"] };
const windowMs = 15 * 60_000;
export class MfaError extends ServiceError {
  constructor(
    code: string,
    status = 400,
    public readonly retryAfter?: number,
  ) {
    super(code, status);
  }
}
export function mfaRateKey(userId: string) {
  return `${mfaNamespace(userId)}verification`;
}
export function webAuthnUserId(userId: string) {
  return createHash("sha256").update(`harnois-webauthn:${userId}`).digest();
}

/** All factor mutations lock User first. Negative proof results commit their audit, counter and challenge consumption. */
export class MfaService {
  readonly db: PrismaClient;
  readonly env: ServerEnv;
  private readonly mail: EmailSender;
  private readonly clock: () => Date;
  constructor(
    dependencies: {
      db?: PrismaClient;
      env?: ServerEnv;
      mail?: EmailSender;
      now?: () => Date;
    } = {},
  ) {
    this.db = dependencies.db ?? getDb();
    this.env = dependencies.env ?? getServerEnv();
    this.mail =
      dependencies.mail ?? ((message) => sendEmail(message, this.env));
    this.clock = dependencies.now ?? (() => new Date());
  }
  private async lock(tx: Tx, userIds: string[]) {
    for (const id of [...new Set(userIds)].sort())
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
  }
  private async run<T>(
    actor: MfaActor,
    access: MfaAccess,
    operation: (tx: Tx, context: MfaContext, now: Date) => Promise<Result<T>>,
  ) {
    const result = await this.db.$transaction(
      async (tx) => {
        await this.lock(tx, [actor.userId]);
        const now = this.clock();
        const context = await loadMfaContext(
          tx,
          actor.userId,
          actor.sessionId,
          now,
        );
        assertMfaAccess(context, access);
        return operation(tx, context, now);
      },
      { timeout: 15_000 },
    );
    if ("error" in result) throw result.error;
    if (result.notification) await this.notify(result.notification, actor.ip);
    return result.data;
  }
  private async notify(notification: Notification, ip?: string) {
    try {
      await this.mail({
        to: notification.email,
        template: "security",
        url: `${this.env.BETTER_AUTH_URL}/profile/security`,
        notice: {
          event: notification.event,
          at: this.clock().toISOString(),
          ip:
            ip === "local-cli"
              ? "opération locale, non applicable"
              : ip && isIP(ip)
                ? ip
                : "indisponible",
        },
      });
    } catch {
      await writeAudit(this.db, {
        action: "MFA_NOTIFICATION_FAILED",
        userId: notification.userId,
        entityType: "Mfa",
        entityId: notification.userId,
      });
    }
  }
  private notice(
    context: MfaContext,
    event: Notification["event"],
  ): Notification {
    return { userId: context.user.id, email: context.user.email, event };
  }
  private async checkLimit(tx: Tx, userId: string, now: Date) {
    const row = await tx.rateLimit.findUnique({
      where: { key: mfaRateKey(userId) },
    });
    if (
      row &&
      row.count >= 5 &&
      Number(row.lastRequest) + windowMs > now.getTime()
    )
      throw new MfaError(
        "MFA_RATE_LIMITED",
        429,
        Math.ceil((Number(row.lastRequest) + windowMs - now.getTime()) / 1000),
      );
  }
  private async fail(
    tx: Tx,
    context: MfaContext,
    now: Date,
    method: Method,
    reason:
      | "INVALID_PROOF"
      | "COUNTER_REGRESSION"
      | "CHALLENGE_INVALID" = "INVALID_PROOF",
  ): Promise<{ error: MfaError }> {
    const key = mfaRateKey(context.user.id);
    const previous = await tx.rateLimit.findUnique({ where: { key } });
    const active =
      previous && Number(previous.lastRequest) + windowMs > now.getTime();
    const count = active ? previous.count + 1 : 1;
    const lastRequest =
      count === 5 || !active ? BigInt(now.getTime()) : previous.lastRequest;
    await tx.rateLimit.upsert({
      where: { key },
      create: { key, count, lastRequest },
      update: { count, lastRequest },
    });
    await writeAudit(tx, {
      action: "MFA_VERIFICATION_FAILED",
      userId: context.user.id,
      entityType: "Mfa",
      entityId: context.session.id,
      method,
      reason,
    });
    if (count >= 5) {
      await writeAudit(tx, {
        action: "MFA_BLOCKED",
        userId: context.user.id,
        entityType: "Mfa",
        entityId: context.session.id,
      });
      return { error: new MfaError("MFA_RATE_LIMITED", 429, windowMs / 1000) };
    }
    return { error: new MfaError("MFA_INVALID_PROOF", 400) };
  }
  private async verified(
    tx: Tx,
    context: MfaContext,
    now: Date,
    method: MfaMethod,
  ) {
    await tx.session.update({
      where: { id: context.session.id },
      data: { mfaVerifiedAt: now, mfaMethod: method },
    });
    await writeAudit(tx, {
      action: "MFA_VERIFIED",
      userId: context.user.id,
      entityType: "Mfa",
      entityId: context.session.id,
      method,
    });
  }
  private async newCodes(tx: Tx, userId: string, now: Date) {
    await tx.recoveryCode.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    });
    const codes = generateRecoveryCodes();
    for (const code of codes)
      await tx.recoveryCode.create({
        data: { userId, codeHash: hashRecoveryCode(userId, code) },
      });
    return codes;
  }
  private async activated(
    tx: Tx,
    context: MfaContext,
    now: Date,
    method: MfaMethod,
    factorId: string,
  ) {
    await writeAudit(tx, {
      action: "MFA_FACTOR_CONFIRMED",
      userId: context.user.id,
      entityType: "Mfa",
      entityId: factorId,
      method,
    });
    await this.verified(tx, context, now, method);
    if (!context.mfa.hasFactor) {
      await tx.session.updateMany({
        where: { userId: context.user.id, id: { not: context.session.id } },
        data: { mfaVerifiedAt: null, mfaMethod: null },
      });
      return this.newCodes(tx, context.user.id, now);
    }
    return undefined;
  }
  private challengeIdentifier(actor: MfaActor, purpose: string) {
    return `${mfaNamespace(actor.userId)}${purpose}:${actor.sessionId}`;
  }
  private async challenge(
    tx: Tx,
    actor: MfaActor,
    purpose: string,
    value: object,
    now: Date,
  ) {
    const identifier = this.challengeIdentifier(actor, purpose);
    await tx.verification.deleteMany({ where: { identifier } });
    return tx.verification.create({
      data: {
        identifier,
        value: JSON.stringify(value),
        expiresAt: new Date(now.getTime() + 5 * 60_000),
      },
    });
  }
  private async consumeChallenge(
    tx: Tx,
    actor: MfaActor,
    purpose: string,
    id: string,
    now: Date,
  ) {
    const challenge = await tx.verification.findFirst({
      where: { id, identifier: this.challengeIdentifier(actor, purpose) },
    });
    if (!challenge) return null;
    await tx.verification.delete({ where: { id } });
    if (challenge.expiresAt <= now) return null;
    return JSON.parse(challenge.value) as { challenge: string; name?: string };
  }
  async status(actor: MfaActor) {
    return this.run(actor, { states: anyState }, async (tx, context) => {
      const totp = await tx.totpFactor.findFirst({
        where: { userId: actor.userId, confirmedAt: { not: null } },
        select: { id: true, createdAt: true, lastUsedAt: true },
      });
      const keys = await tx.webAuthnCredential.findMany({
        where: { userId: actor.userId },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, createdAt: true, lastUsedAt: true },
      });
      const remaining = await tx.recoveryCode.count({
        where: { userId: actor.userId, usedAt: null },
      });
      const hasPassword = Boolean(
        await tx.account.findFirst({
          where: {
            userId: actor.userId,
            providerId: "credential",
            password: { not: null },
          },
          select: { id: true },
        }),
      );
      return { data: { ...context.mfa, totp, keys, remaining, hasPassword } };
    });
  }
  async confirmPrimary(actor: MfaActor, input: unknown) {
    const { password } = primaryProofSchema.parse(input);
    return this.run(
      actor,
      { states: ["setup", "ready"] },
      async (tx, context, now) => {
        if (context.mfa.hasFactor) throw new ServiceError("MFA_REQUIRED", 403);
        await this.checkLimit(tx, actor.userId, now);
        const account = await tx.account.findFirst({
          where: { userId: actor.userId, providerId: "credential" },
        });
        if (
          !account?.password ||
          !(await verifyPassword({ hash: account.password, password }))
        )
          return this.fail(tx, context, now, "PASSWORD");
        const identifier = primaryIdentifier(actor.userId, actor.sessionId);
        await tx.verification.deleteMany({ where: { identifier } });
        await tx.verification.create({
          data: {
            identifier,
            value: "password",
            expiresAt: new Date(now.getTime() + recentWindow),
            createdAt: now,
          },
        });
        await writeAudit(tx, {
          action: "PRIMARY_REVERIFIED",
          userId: actor.userId,
          entityType: "Mfa",
          entityId: actor.sessionId,
          method: "PASSWORD",
        });
        return { data: { verified: true } };
      },
    );
  }
  async startTotp(actor: MfaActor, input: unknown) {
    emptySchema.parse(input);
    return this.run(actor, enrollAccess, async (tx, context, now) => {
      await this.checkLimit(tx, actor.userId, now);
      const existing = await tx.totpFactor.findUnique({
        where: { userId: actor.userId },
      });
      if (existing?.confirmedAt)
        throw new ServiceError("TOTP_ALREADY_CONFIGURED", 409);
      const secret = generateSecret({ length: 20 });
      const secretEncrypted = encryptSecret(
        secret,
        this.env.ENCRYPTION_KEY,
        `totp:${actor.userId}`,
      );
      const factor = await tx.totpFactor.upsert({
        where: { userId: actor.userId },
        create: { userId: actor.userId, secretEncrypted },
        update: {
          secretEncrypted,
          lastUsedStep: null,
          lastUsedAt: null,
          createdAt: now,
        },
      });
      // The pending secret can only be confirmed by the session that requested it.
      await tx.verification.deleteMany({
        where: {
          identifier: {
            startsWith: `${mfaNamespace(actor.userId)}totp-enroll:`,
          },
        },
      });
      await this.challenge(
        tx,
        actor,
        "totp-enroll",
        { factorId: factor.id },
        now,
      );
      await writeAudit(tx, {
        action: "MFA_ENROLLMENT_STARTED",
        userId: actor.userId,
        entityType: "Mfa",
        entityId: factor.id,
        method: "TOTP",
      });
      const uri = generateURI({
        issuer: "Harnois",
        label: context.user.email,
        secret,
        algorithm: "sha1",
        digits: 6,
        period: 30,
      });
      return {
        data: {
          secret,
          qrCode: await QRCode.toDataURL(uri, {
            errorCorrectionLevel: "M",
            width: 256,
            margin: 2,
          }),
        },
      };
    });
  }
  async confirmTotp(actor: MfaActor, input: unknown) {
    const { code } = totpCodeSchema.parse(input);
    return this.run(actor, enrollAccess, async (tx, context, now) => {
      await this.checkLimit(tx, actor.userId, now);
      const factor = await tx.totpFactor.findUnique({
        where: { userId: actor.userId },
      });
      const pending = await tx.verification.findFirst({
        where: {
          identifier: this.challengeIdentifier(actor, "totp-enroll"),
          expiresAt: { gt: now },
        },
      });
      if (
        !factor ||
        factor.confirmedAt ||
        !pending ||
        JSON.parse(pending.value).factorId !== factor.id
      )
        return this.fail(tx, context, now, "TOTP");
      const result = await this.totpResult(factor, code, now);
      if (!result.valid || !("timeStep" in result))
        return this.fail(tx, context, now, "TOTP");
      await tx.totpFactor.update({
        where: { id: factor.id },
        data: {
          confirmedAt: now,
          lastUsedAt: now,
          lastUsedStep: result.timeStep,
        },
      });
      await tx.verification.deleteMany({
        where: {
          identifier: {
            startsWith: `${mfaNamespace(actor.userId)}totp-enroll:`,
          },
        },
      });
      const recoveryCodes = await this.activated(
        tx,
        context,
        now,
        "TOTP",
        factor.id,
      );
      return {
        data: { verified: true, recoveryCodes },
        notification: this.notice(context, "factor-added"),
      };
    });
  }
  private totpResult(
    factor: {
      userId: string;
      secretEncrypted: string;
      lastUsedStep: number | null;
    },
    token: string,
    now: Date,
  ) {
    return verifyTotp({
      secret: decryptSecret(
        factor.secretEncrypted,
        this.env.ENCRYPTION_KEY,
        `totp:${factor.userId}`,
      ),
      token,
      algorithm: "sha1",
      digits: 6,
      period: 30,
      epoch: Math.floor(now.getTime() / 1000),
      epochTolerance: 30,
      ...(factor.lastUsedStep !== null
        ? { afterTimeStep: factor.lastUsedStep }
        : {}),
    });
  }
  async verifyTotp(actor: MfaActor, input: unknown) {
    const { code } = totpCodeSchema.parse(input);
    return this.run(actor, verifyAccess, async (tx, context, now) => {
      await this.checkLimit(tx, actor.userId, now);
      const factor = await tx.totpFactor.findUnique({
        where: { userId: actor.userId },
      });
      if (!factor?.confirmedAt) return this.fail(tx, context, now, "TOTP");
      const result = await this.totpResult(factor, code, now);
      if (!result.valid || !("timeStep" in result))
        return this.fail(tx, context, now, "TOTP");
      await tx.totpFactor.update({
        where: { id: factor.id },
        data: { lastUsedAt: now, lastUsedStep: result.timeStep },
      });
      await this.verified(tx, context, now, "TOTP");
      return { data: { verified: true } };
    });
  }
  async registrationOptions(actor: MfaActor, input: unknown) {
    const { name } = keyNameSchema.parse(input);
    return this.run(actor, enrollAccess, async (tx, context, now) => {
      await this.checkLimit(tx, actor.userId, now);
      const keys = await tx.webAuthnCredential.findMany({
        where: { userId: actor.userId },
      });
      if (keys.length >= 20) throw new ServiceError("TOO_MANY_FACTORS", 409);
      const options = await generateRegistrationOptions({
        rpName: "Harnois",
        rpID: new URL(this.env.BETTER_AUTH_URL).hostname,
        userName: context.user.email,
        userID: webAuthnUserId(actor.userId),
        attestationType: "none",
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
        },
        excludeCredentials: keys.map((key) => ({
          id: key.credentialId,
          transports: key.transports as AuthenticatorTransport[],
        })),
      });
      const challenge = await this.challenge(
        tx,
        actor,
        "webauthn-enroll",
        { challenge: options.challenge, name },
        now,
      );
      await writeAudit(tx, {
        action: "MFA_ENROLLMENT_STARTED",
        userId: actor.userId,
        entityType: "Mfa",
        entityId: actor.sessionId,
        method: "WEBAUTHN",
      });
      return { data: { options, challengeId: challenge.id } };
    });
  }
  async confirmRegistration(actor: MfaActor, input: unknown) {
    const { challengeId, response } = registrationSchema.parse(input);
    return this.run(actor, enrollAccess, async (tx, context, now) => {
      await this.checkLimit(tx, actor.userId, now);
      const challenge = await this.consumeChallenge(
        tx,
        actor,
        "webauthn-enroll",
        challengeId,
        now,
      );
      if (!challenge)
        return this.fail(tx, context, now, "WEBAUTHN", "CHALLENGE_INVALID");
      const url = new URL(this.env.BETTER_AUTH_URL);
      const result = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: url.origin,
        expectedRPID: url.hostname,
        requireUserVerification: false,
        requireUserPresence: true,
      }).catch(() => null);
      if (!result?.verified) return this.fail(tx, context, now, "WEBAUTHN");
      const info = result.registrationInfo;
      if (
        await tx.webAuthnCredential.findUnique({
          where: { credentialId: info.credential.id },
        })
      )
        return this.fail(tx, context, now, "WEBAUTHN");
      if (
        (await tx.webAuthnCredential.count({
          where: { userId: actor.userId },
        })) >= 20
      )
        return this.fail(tx, context, now, "WEBAUTHN");
      const factor = await tx.webAuthnCredential.create({
        data: {
          userId: actor.userId,
          name: challenge.name!,
          credentialId: info.credential.id,
          publicKey: info.credential.publicKey,
          counter: BigInt(info.credential.counter),
          transports: info.credential.transports ?? [],
          deviceType: info.credentialDeviceType,
          backedUp: info.credentialBackedUp,
          aaguid: info.aaguid,
          lastUsedAt: now,
        },
      });
      const recoveryCodes = await this.activated(
        tx,
        context,
        now,
        "WEBAUTHN",
        factor.id,
      );
      return {
        data: { verified: true, recoveryCodes },
        notification: this.notice(context, "factor-added"),
      };
    });
  }
  async authenticationOptions(actor: MfaActor, input: unknown) {
    emptySchema.parse(input);
    return this.run(actor, verifyAccess, async (tx, context, now) => {
      await this.checkLimit(tx, actor.userId, now);
      const keys = await tx.webAuthnCredential.findMany({
        where: { userId: actor.userId },
      });
      if (!keys.length) throw new ServiceError("NO_SECURITY_KEY", 409);
      const options = await generateAuthenticationOptions({
        rpID: new URL(this.env.BETTER_AUTH_URL).hostname,
        userVerification: "preferred",
        allowCredentials: keys.map((key) => ({
          id: key.credentialId,
          transports: key.transports as AuthenticatorTransport[],
        })),
      });
      const challenge = await this.challenge(
        tx,
        actor,
        "webauthn-verify",
        { challenge: options.challenge },
        now,
      );
      return { data: { options, challengeId: challenge.id } };
    });
  }
  async verifyAuthentication(actor: MfaActor, input: unknown) {
    const { challengeId, response } = authenticationSchema.parse(input);
    return this.run(actor, verifyAccess, async (tx, context, now) => {
      await this.checkLimit(tx, actor.userId, now);
      const challenge = await this.consumeChallenge(
        tx,
        actor,
        "webauthn-verify",
        challengeId,
        now,
      );
      if (!challenge)
        return this.fail(tx, context, now, "WEBAUTHN", "CHALLENGE_INVALID");
      const key = await tx.webAuthnCredential.findFirst({
        where: { userId: actor.userId, credentialId: response.id },
      });
      if (
        !key ||
        (response.response.userHandle &&
          response.response.userHandle !==
            webAuthnUserId(actor.userId).toString("base64url"))
      )
        return this.fail(tx, context, now, "WEBAUTHN");
      const url = new URL(this.env.BETTER_AUTH_URL);
      // Verify the signature with counter zero, then enforce our stricter counter rule for ALL device types.
      const result = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: url.origin,
        expectedRPID: url.hostname,
        requireUserVerification: false,
        credential: {
          id: key.credentialId,
          publicKey: new Uint8Array(key.publicKey),
          counter: 0,
          transports: key.transports as AuthenticatorTransport[],
        },
      }).catch(() => null);
      if (!result?.verified) return this.fail(tx, context, now, "WEBAUTHN");
      const info = result.authenticationInfo;
      const counter = BigInt(info.newCounter);
      if ((key.counter > 0n || counter > 0n) && counter <= key.counter)
        return this.fail(tx, context, now, "WEBAUTHN", "COUNTER_REGRESSION");
      await tx.webAuthnCredential.update({
        where: { id: key.id },
        data: { counter, backedUp: info.credentialBackedUp, lastUsedAt: now },
      });
      await this.verified(tx, context, now, "WEBAUTHN");
      return { data: { verified: true } };
    });
  }
  async verifyRecovery(actor: MfaActor, input: unknown) {
    const { code } = recoveryCodeSchema.parse(input);
    return this.run(actor, verifyAccess, async (tx, context, now) => {
      await this.checkLimit(tx, actor.userId, now);
      if (!context.mfa.hasFactor)
        return this.fail(tx, context, now, "RECOVERY_CODE");
      const codes = await tx.recoveryCode.findMany({
        where: { userId: actor.userId, usedAt: null },
      });
      const hash = hashRecoveryCode(actor.userId, code);
      const matches = codes.filter((item) =>
        matchesRecoveryCode(item.codeHash, hash),
      );
      if (matches.length !== 1)
        return this.fail(tx, context, now, "RECOVERY_CODE");
      const consumed = await tx.recoveryCode.updateMany({
        where: { id: matches[0].id, usedAt: null },
        data: { usedAt: now },
      });
      if (consumed.count !== 1)
        return this.fail(tx, context, now, "RECOVERY_CODE");
      await this.verified(tx, context, now, "RECOVERY_CODE");
      await writeAudit(tx, {
        action: "MFA_RECOVERY_USED",
        userId: actor.userId,
        entityType: "Mfa",
        entityId: matches[0].id,
        method: "RECOVERY_CODE",
      });
      return {
        data: { verified: true, remaining: codes.length - 1 },
        notification: this.notice(context, "recovery-used"),
      };
    });
  }
  async regenerateCodes(actor: MfaActor, input: unknown) {
    emptySchema.parse(input);
    return this.run(actor, { fresh: true }, async (tx, context, now) => {
      if (!context.mfa.hasFactor)
        throw new ServiceError("MFA_SETUP_REQUIRED", 403);
      const recoveryCodes = await this.newCodes(tx, actor.userId, now);
      await writeAudit(tx, {
        action: "MFA_RECOVERY_REGENERATED",
        userId: actor.userId,
        entityType: "Mfa",
        entityId: actor.userId,
      });
      return { data: { recoveryCodes } };
    });
  }
  async removeFactor(actor: MfaActor, input: unknown) {
    const { kind, id } = removeFactorSchema.parse(input);
    return this.run(actor, { fresh: true }, async (tx, context, now) => {
      const totp = await tx.totpFactor.findFirst({
        where: { userId: actor.userId, confirmedAt: { not: null } },
      });
      const keys = await tx.webAuthnCredential.findMany({
        where: { userId: actor.userId },
      });
      if (
        kind === "TOTP" ? totp?.id !== id : !keys.some((key) => key.id === id)
      )
        throw new ServiceError("FACTOR_NOT_FOUND", 404);
      const remaining = Number(Boolean(totp)) + keys.length - 1;
      if (!remaining && context.mfa.mandatory)
        throw new ServiceError("LAST_MFA_FACTOR", 409);
      if (kind === "TOTP") await tx.totpFactor.delete({ where: { id } });
      else await tx.webAuthnCredential.delete({ where: { id } });
      await tx.verification.deleteMany({
        where: { identifier: { startsWith: mfaNamespace(actor.userId) } },
      });
      await tx.session.updateMany({
        where: {
          userId: actor.userId,
          ...(!remaining ? {} : { id: { not: actor.sessionId } }),
        },
        data: { mfaVerifiedAt: null, mfaMethod: null },
      });
      if (!remaining)
        await tx.recoveryCode.updateMany({
          where: { userId: actor.userId, usedAt: null },
          data: { usedAt: now },
        });
      await writeAudit(tx, {
        action: "MFA_FACTOR_REMOVED",
        userId: actor.userId,
        entityType: "Mfa",
        entityId: id,
        method: kind,
      });
      return {
        data: { removed: true },
        notification: this.notice(context, "factor-removed"),
      };
    });
  }
  private async reset(tx: Tx, targetId: string, actorId?: string) {
    await tx.totpFactor.deleteMany({ where: { userId: targetId } });
    await tx.webAuthnCredential.deleteMany({ where: { userId: targetId } });
    await tx.recoveryCode.deleteMany({ where: { userId: targetId } });
    await tx.session.deleteMany({ where: { userId: targetId } });
    await tx.verification.deleteMany({
      where: { identifier: { startsWith: mfaNamespace(targetId) } },
    });
    await tx.rateLimit.deleteMany({ where: { key: mfaRateKey(targetId) } });
    await writeAudit(tx, {
      action: actorId ? "MFA_RESET_ADMIN" : "MFA_RESET_CLI",
      userId: actorId,
      entityType: "Mfa",
      entityId: targetId,
    });
  }
  async resetByAdmin(actor: MfaActor, input: unknown) {
    const { email } = resetMfaSchema.parse(input);
    const notification = await this.db.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { email } });
      if (!target) throw new ServiceError("USER_NOT_FOUND", 404);
      if (target.id === actor.userId)
        throw new ServiceError("MFA_SELF_RESET_FORBIDDEN", 403);
      await this.lock(tx, [actor.userId, target.id]);
      const context = await loadMfaContext(
        tx,
        actor.userId,
        actor.sessionId,
        this.clock(),
      );
      assertMfaAccess(context, { roles: ["ADMIN"], fresh: true });
      await this.reset(tx, target.id, actor.userId);
      return {
        userId: target.id,
        email: target.email,
        event: "mfa-reset" as const,
      };
    });
    await this.notify(notification, actor.ip);
    return { reset: true };
  }
  /** Local operator only; never expose this method in an HTTP dispatch table. */
  async resetFromCli(emailInput: unknown) {
    const email = emailSchema.parse(emailInput);
    const notification = await this.db.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { email } });
      if (!target) throw new ServiceError("USER_NOT_FOUND", 404);
      await this.lock(tx, [target.id]);
      await this.reset(tx, target.id);
      return {
        userId: target.id,
        email: target.email,
        event: "mfa-reset" as const,
      };
    });
    await this.notify(notification, "local-cli");
    return { reset: true };
  }
}
