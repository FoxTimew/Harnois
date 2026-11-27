import { z } from "zod";
import { recordId } from "./admin-validation";
import { dateOnlySchema, todayInParis } from "./date-only";
import { tableQuerySchema } from "./table-query";
import { euroAmountSchema } from "./money";
import { specsSchema } from "./equipment-specs";
import { normalizeSearch } from "./search-text";
export const equipmentStatuses = [
  "IN_STOCK",
  "ASSIGNED",
  "LOANED",
  "IN_REPAIR",
  "LOST",
  "RETIRED",
] as const;
export const equipmentConditions = ["NEW", "GOOD", "FAIR", "DAMAGED"] as const;
export type EquipmentState = (typeof equipmentStatuses)[number];
export const equipmentStatusLabels: Record<EquipmentState, string> = {
  IN_STOCK: "En stock",
  ASSIGNED: "Assigné",
  LOANED: "En prêt",
  IN_REPAIR: "En réparation",
  LOST: "Perdu",
  RETIRED: "Réformé",
};
export const conditionLabels = {
  NEW: "Neuf",
  GOOD: "Bon état",
  FAIR: "État correct",
  DAMAGED: "Endommagé",
} as const;
export const directTransitions: Record<EquipmentState, EquipmentState[]> = {
  IN_STOCK: ["IN_REPAIR", "LOST", "RETIRED"],
  ASSIGNED: [],
  LOANED: [],
  IN_REPAIR: ["IN_STOCK", "LOST", "RETIRED"],
  LOST: ["IN_STOCK", "IN_REPAIR", "RETIRED"],
  RETIRED: [],
};
const nullableText = (max: number) =>
  z.string().trim().min(1).max(max).nullable();
export const assetTagSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(80)
  .regex(
    /^[A-Z0-9][A-Z0-9._/-]*$/,
    "Numéro : lettres, chiffres, point, tiret ou barre oblique.",
  );
export const equipmentFieldsSchema = z
  .object({
    assetTag: assetTagSchema.nullable().default(null),
    name: z.string().trim().min(1, "La désignation est obligatoire.").max(160),
    brand: nullableText(100).default(null),
    model: nullableText(100).default(null),
    serialNumber: nullableText(150).default(null),
    categoryId: recordId,
    supplierId: recordId.nullable().default(null),
    locationId: recordId.nullable().default(null),
    status: z.enum(equipmentStatuses).default("IN_STOCK"),
    condition: z.enum(equipmentConditions).default("NEW"),
    purchaseDate: dateOnlySchema.nullable().default(null),
    warrantyEndDate: dateOnlySchema.nullable().default(null),
    depreciationMonths: z
      .number()
      .int()
      .min(1)
      .max(600)
      .nullable()
      .default(null),
    purchasePrice: euroAmountSchema.nullable().optional(),
    specs: specsSchema.default({}),
    notes: nullableText(2000).default(null),
  })
  .strict()
  .refine(
    (v) =>
      !v.purchaseDate ||
      !v.warrantyEndDate ||
      v.warrantyEndDate >= v.purchaseDate,
    "La garantie ne peut pas finir avant l’achat.",
  );
export type EquipmentFields = z.infer<typeof equipmentFieldsSchema>;
export const equipmentMutationSchema = z
  .object({
    id: recordId.optional(),
    updatedAt: z.iso.datetime().optional(),
    fields: equipmentFieldsSchema,
    reason: z.string().trim().max(1000).default(""),
  })
  .strict();
export const equipmentQuerySchema = tableQuerySchema.extend({
  q: z.string().trim().max(100).catch("").transform(normalizeSearch),
  sort: z
    .enum(["assetTag", "name", "status", "warrantyEndDate", "createdAt"])
    .catch("assetTag"),
  categoryId: recordId.optional().catch(undefined),
  status: z.enum(equipmentStatuses).optional().catch(undefined),
  locationId: recordId.optional().catch(undefined),
  supplierId: recordId.optional().catch(undefined),
  employeeId: recordId.optional().catch(undefined),
  warranty: z.enum(["expired", "soon", "none"]).optional().catch(undefined),
  departed: z.enum(["true"]).optional().catch(undefined),
});
export function parseEquipmentLabel<T extends string>(
  value: string,
  labels: Record<T, string>,
): T {
  const key = (Object.keys(labels) as T[]).find(
    (k) =>
      normalizeSearch(k) === normalizeSearch(value) ||
      normalizeSearch(labels[k]) === normalizeSearch(value),
  );
  if (!key) throw new Error("Valeur inconnue.");
  return key;
}
export function equipmentIndicators(
  row: {
    warrantyEndDate: string | null;
    purchaseDate: string | null;
    depreciationMonths: number | null;
  },
  today = todayInParis(),
) {
  const soon = new Date(today + "T00:00:00Z");
  soon.setUTCDate(soon.getUTCDate() + 60);
  let end: string | null = null;
  if (row.purchaseDate && row.depreciationMonths) {
    const date = new Date(row.purchaseDate + "T00:00:00Z");
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + row.depreciationMonths);
    const last = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(day, last));
    end = date.toISOString().slice(0, 10);
  }
  return {
    warrantyExpired: !!row.warrantyEndDate && row.warrantyEndDate < today,
    warrantySoon:
      !!row.warrantyEndDate &&
      row.warrantyEndDate >= today &&
      row.warrantyEndDate <= soon.toISOString().slice(0, 10),
    depreciated: end === null ? null : end <= today,
  };
}
