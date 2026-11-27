import { z } from "zod";
import { recordId } from "./admin-validation";
export const referenceKindSchema = z.enum([
  "organizations",
  "departments",
  "locations",
]);
export type ReferenceKind = z.infer<typeof referenceKindSchema>;
export const referenceLabels: Record<ReferenceKind, string> = {
  organizations: "Organisations",
  departments: "Pôles",
  locations: "Sites",
};
export const referenceFieldsSchema = z
  .object({
    name: z.string().trim().min(1, "Nom obligatoire.").max(120),
    organizationId: recordId.nullable(),
    address: z.string().trim().max(240).nullable(),
    city: z.string().trim().max(120).nullable(),
  })
  .strict();
export const referenceMutationSchema = z
  .object({
    kind: referenceKindSchema,
    operation: z.enum(["save", "delete"]),
    id: recordId.optional(),
    updatedAt: z.iso.datetime().optional(),
    fields: referenceFieldsSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.id && !data.updatedAt)
      ctx.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "Version obligatoire.",
      });
    if (data.operation === "delete" && !data.id)
      ctx.addIssue({
        code: "custom",
        path: ["id"],
        message: "Identifiant obligatoire.",
      });
    if (data.operation === "save" && !data.fields)
      ctx.addIssue({
        code: "custom",
        path: ["fields"],
        message: "Informations obligatoires.",
      });
    if (
      data.operation === "save" &&
      data.kind === "departments" &&
      !data.fields?.organizationId
    )
      ctx.addIssue({
        code: "custom",
        path: ["fields", "organizationId"],
        message: "Organisation obligatoire.",
      });
  });
