import "server-only";
import nodemailer from "nodemailer";
import { emailSchema } from "@/lib/validation";
import { getServerEnv, type ServerEnv } from "@/server/env";
import { ServiceError } from "@/server/services/errors";
import {
  renderEmail,
  renderSecurityEmail,
  type EmailTemplate,
  type SecurityNotice,
} from "./templates";

export type EmailMessage = { to: string; url: string } & (
  { template: EmailTemplate } | { template: "security"; notice: SecurityNotice }
);
export type EmailSender = (message: EmailMessage) => Promise<void>;

export function assertMailConfigured(env: ServerEnv) {
  if (
    !env.SMTP_HOST ||
    !env.SMTP_PORT ||
    !env.SMTP_FROM ||
    Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)
  )
    throw new ServiceError("EMAIL_TRANSPORT_UNAVAILABLE", 503);
}

/** Phase 11 can replace this transport without changing the authentication services. */
export async function sendEmail(message: EmailMessage, env = getServerEnv()) {
  assertMailConfigured(env);
  const to = emailSchema.parse(message.to);
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    requireTLS: env.SMTP_REQUIRE_TLS,
    ...(env.SMTP_USER
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD! } }
      : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    await transport.sendMail({
      from: { name: env.SMTP_FROM_NAME ?? "Harnois", address: env.SMTP_FROM! },
      to,
      ...(message.template === "security"
        ? renderSecurityEmail(message.notice, message.url)
        : renderEmail(message.template, message.url)),
    });
  } catch {
    // SMTP errors may contain credentials, addresses or message contents.
    throw new ServiceError("EMAIL_DELIVERY_FAILED", 503);
  } finally {
    transport.close();
  }
}
