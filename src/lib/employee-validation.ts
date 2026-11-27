import { z } from "zod";
import { recordId } from "./admin-validation";
import { emailSchema } from "./validation";
import { phoneSchema } from "./phone";
import { dateOnlySchema } from "./date-only";
import { tableQuerySchema } from "./table-query";

export const employeeStatuses = [
  "ONBOARDING",
  "ACTIVE",
  "OFFBOARDING",
  "LEFT",
] as const;
export const employeeStatusSchema = z.enum(employeeStatuses);
export type EmployeeStatus = z.infer<typeof employeeStatusSchema>;
export const employeeStatusLabels: Record<EmployeeStatus, string> = {
  ONBOARDING: "En arrivée",
  ACTIVE: "Actif",
  OFFBOARDING: "En départ",
  LEFT: "Parti",
};
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/gu, " ");
}
export function parseEmployeeStatus(value: string): EmployeeStatus {
  const normalized = normalizeSearch(value);
  const found = employeeStatuses.find(
    (status) =>
      status.toLowerCase() === normalized ||
      normalizeSearch(employeeStatusLabels[status]) === normalized,
  );
  return employeeStatusSchema.parse(found);
}
export const employeeFieldsSchema = z
  .object({
    firstName: z.string().trim().min(1, "Prénom obligatoire.").max(120),
    lastName: z.string().trim().min(1, "Nom obligatoire.").max(120),
    email: emailSchema,
    phone: phoneSchema.nullable(),
    jobTitle: z.string().trim().min(1).max(160).nullable(),
    status: employeeStatusSchema,
    startDate: dateOnlySchema.nullable(),
    endDate: dateOnlySchema.nullable(),
    organizationId: recordId.nullable(),
    departmentId: recordId.nullable(),
    locationId: recordId.nullable(),
    managerId: recordId.nullable(),
  })
  .strict();
export type EmployeeFields = z.infer<typeof employeeFieldsSchema>;
export const employeeMutationSchema = z
  .object({
    id: recordId.optional(),
    updatedAt: z.iso.datetime().optional(),
    fields: employeeFieldsSchema,
    immediateDepartureConfirmed: z.boolean().default(false),
    deactivateAccount: z.boolean().default(false),
  })
  .strict()
  .refine((data) => !data.id || !!data.updatedAt, {
    path: ["updatedAt"],
    message: "La version de la fiche est obligatoire.",
  });
export const employeeQuerySchema = tableQuerySchema.extend({
  sort: z
    .enum(["lastName", "firstName", "email", "status", "jobTitle"])
    .catch("lastName"),
  status: employeeStatusSchema.optional().catch(undefined),
  organizationId: recordId.optional().catch(undefined),
  departmentId: recordId.optional().catch(undefined),
  locationId: recordId.optional().catch(undefined),
  managerId: recordId.optional().catch(undefined),
});
export type EmployeeQuery = z.infer<typeof employeeQuerySchema>;
export const employeeTransitions: Record<
  EmployeeStatus,
  readonly EmployeeStatus[]
> = {
  ONBOARDING: ["ACTIVE", "LEFT"],
  ACTIVE: ["OFFBOARDING", "LEFT"],
  OFFBOARDING: ["ACTIVE", "LEFT"],
  LEFT: ["ONBOARDING"],
};
