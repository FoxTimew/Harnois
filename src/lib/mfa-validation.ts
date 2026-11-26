import { z } from "zod";
import { emailSchema } from "./validation";

export const emptySchema = z.object({}).strict();
export const totpCodeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/),
  })
  .strict();
export const recoveryCodeSchema = z
  .object({
    code: z
      .string()
      .max(100)
      .transform((value) => value.toUpperCase().replace(/[-\s]/g, ""))
      .pipe(z.string().regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{16}$/)),
  })
  .strict();
export const keyNameSchema = z
  .object({ name: z.string().trim().min(1).max(80) })
  .strict();
const base64url = z
  .string()
  .min(1)
  .max(24_000)
  .regex(/^[A-Za-z0-9_-]+$/);
const transports = z.enum([
  "usb",
  "nfc",
  "ble",
  "hybrid",
  "internal",
  "cable",
  "smart-card",
]);
const extensionResults = z.record(z.string(), z.unknown());
export const registrationSchema = z
  .object({
    challengeId: z.string().min(1).max(128),
    response: z.object({
      id: base64url,
      rawId: base64url,
      type: z.literal("public-key"),
      response: z.object({
        clientDataJSON: base64url,
        attestationObject: base64url,
        transports: z.array(transports).max(8).optional(),
        publicKeyAlgorithm: z.number().optional(),
        publicKey: base64url.optional(),
        authenticatorData: base64url.optional(),
      }),
      clientExtensionResults: extensionResults,
      authenticatorAttachment: z
        .enum(["platform", "cross-platform"])
        .optional(),
    }),
  })
  .strict();
export const authenticationSchema = z
  .object({
    challengeId: z.string().min(1).max(128),
    response: z.object({
      id: base64url,
      rawId: base64url,
      type: z.literal("public-key"),
      response: z.object({
        clientDataJSON: base64url,
        authenticatorData: base64url,
        signature: base64url,
        userHandle: base64url.optional(),
      }),
      clientExtensionResults: extensionResults,
      authenticatorAttachment: z
        .enum(["platform", "cross-platform"])
        .optional(),
    }),
  })
  .strict();
export const removeFactorSchema = z
  .object({
    kind: z.enum(["TOTP", "WEBAUTHN"]),
    id: z.string().min(1).max(128),
  })
  .strict();
export const primaryProofSchema = z
  .object({ password: z.string().min(1).max(128) })
  .strict();
export const resetMfaSchema = z
  .object({ email: emailSchema, confirmed: z.literal(true) })
  .strict();
