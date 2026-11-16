import "server-only";
import { z } from "zod";
import { emailSchema } from "@/lib/validation";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);
const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url().optional(),
);
const port = z.coerce.number().int().min(1).max(65535);

const serverEnvSchema = z
  .object({
    DATABASE_URL: z.url().refine((value) => /^postgres(ql)?:\/\//.test(value)),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url().refine((value) => /^https?:\/\//.test(value)),
    ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    MICROSOFT_CLIENT_ID: optionalString,
    MICROSOFT_CLIENT_SECRET: optionalString,
    MICROSOFT_TENANT_ID: optionalString,
    BREVO_API_KEY: optionalString,
    BREVO_EMAIL_FROM: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.email().optional(),
    ),
    BREVO_EMAIL_FROM_NAME: optionalString,
    BREVO_SMS_SENDER: optionalString,
    SMTP_HOST: optionalString,
    SMTP_PORT: z.preprocess(
      (value) => (value === "" ? undefined : value),
      port.optional(),
    ),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    SMTP_FROM: z.preprocess(
      (value) => (value === "" ? undefined : value),
      emailSchema.optional(),
    ),
    SMTP_FROM_NAME: optionalString,
    SMTP_SECURE: z
      .enum(["true", "false", ""])
      .optional()
      .transform((v) => v === "true"),
    SMTP_REQUIRE_TLS: z
      .enum(["true", "false", ""])
      .optional()
      .transform((v) => v === "true"),
    APP_BIND_ADDRESS: optionalString,
    S3_ENDPOINT: optionalUrl,
    S3_REGION: optionalString,
    S3_BUCKET: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z
        .string()
        .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
        .optional(),
    ),
    S3_ACCESS_KEY: optionalString,
    S3_SECRET_KEY: optionalString,
    S3_FORCE_PATH_STYLE: z
      .preprocess(
        (value) => (value === "" ? undefined : value),
        z.enum(["true", "false"]).optional(),
      )
      .transform((value) => value === "true"),
    APP_PORT: port.optional().default(3000),
    POSTGRES_USER: optionalString,
    POSTGRES_PASSWORD: optionalString,
    POSTGRES_DB: optionalString,
    POSTGRES_PORT: port.optional(),
  })
  .superRefine((env, ctx) => {
    if (!z.url().safeParse(env.BETTER_AUTH_URL).success) return;
    const authUrl = new URL(env.BETTER_AUTH_URL);
    if (
      authUrl.protocol !== "https:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(authUrl.hostname)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_URL"],
        message: "HTTPS required outside localhost",
      });
    }
    if (
      authUrl.username ||
      authUrl.password ||
      authUrl.search ||
      authUrl.hash ||
      authUrl.pathname !== "/"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_URL"],
        message: "An origin without credentials or path is required",
      });
    }
    if (
      authUrl.protocol === "https:" &&
      env.MICROSOFT_TENANT_ID &&
      !z.uuid().safeParse(env.MICROSOFT_TENANT_ID).success
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["MICROSOFT_TENANT_ID"],
        message: "An organization tenant UUID is required",
      });
    }
    const groups = [
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_TENANT_ID"],
      [
        "S3_ENDPOINT",
        "S3_REGION",
        "S3_BUCKET",
        "S3_ACCESS_KEY",
        "S3_SECRET_KEY",
      ],
    ] as const;
    for (const group of groups) {
      if (group.some((key) => env[key] !== undefined)) {
        for (const key of group) {
          if (env[key] === undefined)
            ctx.addIssue({
              code: "custom",
              path: [key],
              message: "Incomplete configuration",
            });
        }
      }
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  input: Record<string, string | undefined>,
): ServerEnv {
  const result = serverEnvSchema.safeParse(input);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];
    // Never include supplied values or the original Zod error in logs.
    throw new Error(`Invalid server configuration: ${fields.join(", ")}`);
  }
  return result.data;
}

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  return (cachedEnv ??= parseServerEnv(process.env));
}
