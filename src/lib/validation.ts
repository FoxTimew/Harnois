import { z } from "zod";

/** Use the same normalization for lookups and writes. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const currencySchema = z.literal("EUR");

export const passwordSchema = z
  .string()
  .min(12, "Au moins 12 caractères.")
  .max(128, "128 caractères maximum.");
export const nameSchema = z
  .string()
  .trim()
  .min(1, "Renseignez votre nom.")
  .max(120);
export const roleSchema = z.enum([
  "ADMIN",
  "IT_MANAGER",
  "TECHNICIAN",
  "EMPLOYEE",
]);
export const invitationSchema = z.object({
  email: emailSchema,
  role: roleSchema,
  employeeId: z.string().min(1).optional(),
});
export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export const registrationSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});
