import { z } from "zod";
import { recordId } from "./admin-validation";
import { emailSchema } from "./validation";
import { phoneSchema } from "./phone";
import { specDefinitionsSchema } from "./equipment-specs";
export const categoryIcons = [
  "computer",
  "monitor",
  "phone",
  "printer",
  "network",
  "box",
] as const;
export const categoryMutationSchema = z
  .object({
    id: recordId.optional(),
    updatedAt: z.iso.datetime().optional(),
    operation: z.enum(["save", "delete"]).default("save"),
    name: z.string().trim().min(1).max(100),
    icon: z.enum(categoryIcons).nullable().default(null),
    parentId: recordId.nullable().default(null),
    specDefinitions: specDefinitionsSchema.default([]),
  })
  .strict();
export const supplierMutationSchema = z
  .object({
    id: recordId.optional(),
    updatedAt: z.iso.datetime().optional(),
    operation: z.enum(["save", "delete"]).default("save"),
    name: z.string().trim().min(1).max(160),
    email: emailSchema.nullable().default(null),
    phone: phoneSchema.nullable().default(null),
    website: z
      .url()
      .max(500)
      .refine((v) => /^https?:\/\//.test(v), "URL HTTP ou HTTPS requise.")
      .nullable()
      .default(null),
    notes: z.string().trim().max(2000).nullable().default(null),
  })
  .strict();
