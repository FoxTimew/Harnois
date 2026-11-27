import { z } from "zod";
export const specDefinitionSchema = z
  .object({
    key: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,39}$/)
      .refine((v) => !["constructor", "prototype", "__proto__"].includes(v)),
    label: z.string().trim().min(1).max(80),
    type: z.enum(["text", "number", "boolean", "choice"]),
    unit: z.string().trim().max(20).default(""),
    choices: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
    disabled: z.boolean().default(false),
  })
  .strict()
  .refine(
    (d) =>
      d.type !== "choice" ||
      (d.choices.length > 0 && new Set(d.choices).size === d.choices.length),
    "Définissez des choix distincts.",
  );
export const specDefinitionsSchema = z
  .array(specDefinitionSchema)
  .max(32)
  .refine(
    (d) => new Set(d.map((x) => x.key)).size === d.length,
    "Les clés doivent être distinctes.",
  );
export type SpecDefinition = z.infer<typeof specDefinitionSchema>;
export const specsSchema = z.preprocess(
  (value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).filter(([, v]) => v !== undefined),
        )
      : value,
  z
    .record(
      z.string().max(40),
      z.union([
        z.string().max(500),
        z.number().finite().min(0).max(1e9),
        z.boolean(),
      ]),
    )
    .refine(
      (v) =>
        Object.keys(v).length <= 64 &&
        !Object.keys(v).some((k) =>
          ["constructor", "prototype", "__proto__"].includes(k),
        ),
    ),
);
export type Specs = z.infer<typeof specsSchema>;
export function specsMatch(
  definitions: SpecDefinition[],
  values: Specs,
  previous: Specs = {},
) {
  return Object.entries(values).every(([key, value]) => {
    const d = definitions.find((x) => x.key === key);
    if (!d || d.disabled) return previous[key] === value;
    return d.type === "text"
      ? typeof value === "string"
      : d.type === "number"
        ? typeof value === "number"
        : d.type === "boolean"
          ? typeof value === "boolean"
          : typeof value === "string" && d.choices.includes(value);
  });
}
