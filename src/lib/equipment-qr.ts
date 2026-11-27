import { z } from "zod";
import { recordId } from "./admin-validation";
export function equipmentUrl(origin: string, id: string) {
  return new URL(
    "/equipment/" + encodeURIComponent(recordId.parse(id)),
    new URL(origin).origin,
  ).toString();
}
export function scannedEquipmentPath(value: string, origin: string) {
  const url = new URL(value);
  if (
    url.origin !== new URL(origin).origin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Ce QR ne correspond pas à ce site Harnois.");
  const match = /^\/equipment\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
  if (!match || !recordId.safeParse(match[1]).success)
    throw new Error("Ce QR ne désigne pas un équipement Harnois.");
  return url.pathname;
}
export const labelOptionsSchema = z
  .object({
    ids: z
      .array(recordId)
      .min(1)
      .max(210)
      .refine((v) => new Set(v).size === v.length),
    format: z.enum(["sheet", "single"]).default("sheet"),
    startPosition: z.coerce.number().int().min(1).max(21).default(1),
    marginTop: z.coerce.number().min(0).max(30).default(15.15),
    marginLeft: z.coerce.number().min(0).max(12).default(7.25),
  })
  .strict()
  .refine(
    (v) => v.format !== "single" || v.ids.length === 1,
    "Une étiquette individuelle exige un seul équipement.",
  )
  .refine(
    (v) =>
      v.marginTop + 7 * 38.1 <= 297 && v.marginLeft + 3 * 63.5 + 2 * 2.5 <= 210,
    "Les marges dépassent la page A4.",
  );
