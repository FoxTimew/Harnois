import "server-only";
import {
  digest,
  createReceipt,
  readReceipt,
  validateReceipt,
  consumeReceipt,
} from "@/server/imports/receipt";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { emailSchema } from "@/lib/validation";
import { recordId } from "@/lib/admin-validation";
import { actionMessage } from "@/lib/action-result";
import {
  employeeFieldsSchema,
  employeeStatusLabels,
  parseEmployeeStatus,
  type EmployeeFields,
} from "@/lib/employee-validation";
import { parseCivilDate } from "@/lib/date-only";
import {
  readEmployeeCsv,
  csvOptionsSchema,
  type EmployeeCsvColumn,
} from "@/server/imports/employee-csv";
import { lockStaff } from "@/server/locks";
import {
  serviceAccess,
  lockUsers,
  type Actor,
} from "@/server/auth/service-access";
import {
  validateEmployeeDates,
  validateEmployeeTransition,
  hierarchyProblems,
} from "./employee-invariants";
import {
  employeeFields,
  lockEmployeeChanges,
  validateEmployeeChanges,
  persistEmployeeChanges,
  type EmployeeChange,
} from "./employees";
import { writeAudit } from "./audit";
import { ServiceError } from "./errors";

export type ImportIssue = { field: string; message: string };
export type ImportPreviewRow = {
  line: number;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  operation: "create" | "update" | "unchanged";
  errors: ImportIssue[];
};
type ProposedReference = {
  id: string;
  kind: "organizations" | "departments";
  name: string;
  organizationId: string | null;
  organizationName: string | null;
};
export const importConfirmationSchema = z
  .object({
    previewId: recordId,
    options: csvOptionsSchema,
    approvedReferences: z.array(recordId).max(2000),
    immediateDepartureConfirmed: z.boolean().default(false),
    deactivateAccount: z.boolean().default(false),
  })
  .strict();
const blankFields = (): EmployeeFields => ({
  firstName: "",
  lastName: "",
  email: "",
  phone: null,
  jobTitle: null,
  status: "ONBOARDING",
  startDate: null,
  endDate: null,
  organizationId: null,
  departmentId: null,
  locationId: null,
  managerId: null,
});
const fieldColumns: Record<string, EmployeeCsvColumn> = {
  firstName: "prenom",
  lastName: "nom",
  email: "email",
  phone: "telephone",
  jobTitle: "poste",
  status: "statut",
  startDate: "date_arrivee",
  endDate: "date_depart",
  organizationId: "organisation",
  departmentId: "pole",
  locationId: "site",
  managerId: "manager_email",
};
async function buildImportPlan(
  tx: Prisma.TransactionClient,
  bytes: Uint8Array,
  options: unknown,
  role: string,
) {
  const csv = readEmployeeCsv(bytes, options);
  const fileHash = digest(bytes);
  const employees = await tx.employee.findMany({ orderBy: { id: "asc" } });
  const organizations = await tx.organization.findMany({
    orderBy: { id: "asc" },
  });
  const departments = await tx.department.findMany({ orderBy: { id: "asc" } });
  const locations = await tx.location.findMany({ orderBy: { id: "asc" } });
  const users = await tx.user.findMany({
    where: { employeeId: { not: null } },
    select: { id: true, employeeId: true, isActive: true, role: true },
    orderBy: { id: "asc" },
  });
  const baseline = digest(
    JSON.stringify({
      employees: employees.map((row) => [row.id, row.updatedAt.toISOString()]),
      organizations: organizations.map((row) => [
        row.id,
        row.updatedAt.toISOString(),
      ]),
      departments: departments.map((row) => [
        row.id,
        row.updatedAt.toISOString(),
      ]),
      locations: locations.map((row) => [row.id, row.updatedAt.toISOString()]),
      users,
    }),
  );
  const existingEmails = new Map(employees.map((row) => [row.email, row]));
  const idByEmail = new Map(employees.map((row) => [row.email, row.id]));
  const seen = new Map<string, number[]>();
  csv.records.forEach((row, index) => {
    const parsed = emailSchema.safeParse(row.cells.email);
    if (parsed.success) {
      const email = parsed.data;
      if (!seen.has(email)) seen.set(email, []);
      seen.get(email)!.push(index);
      if (!idByEmail.has(email))
        idByEmail.set(email, "imp_" + digest(fileHash + email).slice(0, 40));
    }
  });
  const proposed: ProposedReference[] = [];
  const organizationMap = new Map(
    organizations.map((row) => [row.name, row.id]),
  );
  const departmentMap = new Map(
    departments.map((row) => [
      JSON.stringify([row.organizationId, row.name]),
      row.id,
    ]),
  );
  const departmentOrganizations = new Map(
    departments.map((row) => [row.id, row.organizationId]),
  );
  const locationMap = new Map(locations.map((row) => [row.name, row.id]));
  const rows: ImportPreviewRow[] = [];
  const changes: EmployeeChange[] = [];
  const rowChanges = new Map<string, ImportPreviewRow>();
  const managerChanges = new Set<string>();
  let immediateDepartures = 0,
    activeLinkedDepartures = 0,
    reentries = 0;
  for (const row of csv.records) {
    const parsedEmail = emailSchema.safeParse(row.cells.email);
    const email = parsedEmail.success ? parsedEmail.data : "";
    const before = existingEmails.get(email) ?? null;
    const fields = before ? employeeFields(before) : blankFields();
    const errors: ImportIssue[] = [];
    const error = (field: string, message: string) =>
      errors.push({ field, message });
    if (row.invalidLength)
      error("ligne", "Le nombre de cellules ne correspond pas aux colonnes.");
    for (const key of ["email", "prenom", "nom"] as const) {
      if (!row.cells[key] || row.cells[key] === "__CLEAR__")
        error(key, "Valeur obligatoire ; ce champ ne peut pas être effacé.");
    }
    fields.email = email;
    fields.firstName = row.cells.prenom ?? "";
    fields.lastName = row.cells.nom ?? "";
    if ((seen.get(email)?.length ?? 0) > 1)
      error("email", "Adresse présente plusieurs fois dans le fichier.");
    for (const key of ["phone", "jobTitle", "startDate", "endDate"] as const) {
      const cell = row.cells[fieldColumns[key]];
      if (cell === "__CLEAR__") fields[key] = null;
      else if (cell) {
        if (key === "startDate" || key === "endDate") {
          try {
            fields[key] = parseCivilDate(cell);
          } catch {
            error(
              fieldColumns[key],
              "Date invalide : utilisez JJ/MM/AAAA ou AAAA-MM-JJ.",
            );
          }
        } else fields[key] = cell;
      }
    }
    if (row.cells.statut) {
      try {
        fields.status = parseEmployeeStatus(row.cells.statut);
      } catch {
        error(
          "statut",
          "Statut inconnu. Utilisez En arrivée, Actif, En départ ou Parti.",
        );
      }
    }
    const orgName = row.cells.organisation;
    if (orgName === "__CLEAR__") fields.organizationId = null;
    else if (orgName) {
      if (orgName.length > 120)
        error("organisation", "Le nom dépasse 120 caractères.");
      else {
        if (!organizationMap.has(orgName)) {
          const id = "imp_org_" + digest(orgName).slice(0, 32);
          organizationMap.set(orgName, id);
          proposed.push({
            id,
            kind: "organizations",
            name: orgName,
            organizationId: null,
            organizationName: null,
          });
        }
        fields.organizationId = organizationMap.get(orgName)!;
      }
    }
    const departmentName = row.cells.pole;
    if (departmentName === "__CLEAR__") fields.departmentId = null;
    else if (departmentName) {
      if (!orgName || orgName === "__CLEAR__" || !fields.organizationId)
        error(
          "organisation",
          "Indiquez l’organisation lorsque vous renseignez un pôle.",
        );
      else if (departmentName.length > 120)
        error("pole", "Le nom dépasse 120 caractères.");
      else {
        const key = JSON.stringify([fields.organizationId, departmentName]);
        if (!departmentMap.has(key)) {
          const id = "imp_dept_" + digest(key).slice(0, 32);
          departmentMap.set(key, id);
          departmentOrganizations.set(id, fields.organizationId);
          proposed.push({
            id,
            kind: "departments",
            name: departmentName,
            organizationId: fields.organizationId,
            organizationName: orgName,
          });
        }
        fields.departmentId = departmentMap.get(key)!;
      }
    }
    if (fields.departmentId) {
      const organizationId = departmentOrganizations.get(fields.departmentId);
      if (organizationId && fields.organizationId !== organizationId)
        error(
          "organisation",
          "L’organisation ne correspond pas au pôle conservé ou sélectionné.",
        );
      else if (organizationId) fields.organizationId = organizationId;
    }
    const site = row.cells.site;
    if (site === "__CLEAR__") fields.locationId = null;
    else if (site) {
      if (!locationMap.has(site))
        error(
          "site",
          "Site inconnu : créez-le dans les référentiels avant l’import.",
        );
      else fields.locationId = locationMap.get(site)!;
    }
    const manager = row.cells.manager_email;
    if (manager === "__CLEAR__") fields.managerId = null;
    else if (manager) {
      const parsed = emailSchema.safeParse(manager);
      if (!parsed.success || !idByEmail.has(parsed.data))
        error(
          "manager_email",
          "Manager introuvable en base ou dans ce fichier.",
        );
      else fields.managerId = idByEmail.get(parsed.data)!;
    }
    const parsed = employeeFieldsSchema.safeParse(fields);
    if (!parsed.success)
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        error(
          fieldColumns[key] ?? key,
          key === "phone"
            ? "Numéro international invalide (avec +, sans extension)."
            : "Valeur invalide ou trop longue.",
        );
      }
    else Object.assign(fields, parsed.data);
    try {
      validateEmployeeDates(fields);
      if (before) {
        validateEmployeeTransition(before.status, fields.status, role, true);
        if (
          before.status === "OFFBOARDING" &&
          fields.status === "ACTIVE" &&
          fields.endDate
        )
          throw new ServiceError("CANCEL_DEPARTURE_DATE");
      }
    } catch (cause) {
      error(
        "statut / dates",
        actionMessage(
          cause instanceof ServiceError ? cause.code : "INVALID_REQUEST",
        ),
      );
    }
    const id = idByEmail.get(email) ?? "invalid_" + row.line;
    const operation = !before
      ? "create"
      : JSON.stringify(employeeFields(before)) === JSON.stringify(fields)
        ? "unchanged"
        : "update";
    const preview: ImportPreviewRow = {
      line: row.line,
      email,
      firstName: fields.firstName,
      lastName: fields.lastName,
      status: employeeStatusLabels[fields.status],
      operation,
      errors,
    };
    rows.push(preview);
    changes.push({ id, before, fields });
    rowChanges.set(id, preview);
    if (fields.managerId && fields.managerId !== before?.managerId)
      managerChanges.add(id);
    if (before?.status === "ACTIVE" && fields.status === "LEFT")
      immediateDepartures++;
    if (before?.status === "LEFT" && fields.status !== "LEFT") reentries++;
    if (
      fields.status === "LEFT" &&
      users.some((user) => user.employeeId === id && user.isActive)
    )
      activeLinkedDepartures++;
  }
  const graph = new Map(
    employees.map((row) => [
      row.id,
      { id: row.id, managerId: row.managerId, status: row.status },
    ]),
  );
  for (const row of changes)
    graph.set(row.id, {
      id: row.id,
      managerId: row.fields.managerId,
      status: row.fields.status,
    });
  for (const [id, code] of hierarchyProblems([...graph.values()])) {
    const row = rowChanges.get(id);
    if (row)
      row.errors.push({ field: "manager_email", message: actionMessage(code) });
    else
      for (const change of changes)
        if (change.fields.managerId === id)
          rowChanges.get(change.id)!.errors.push({
            field: "manager_email",
            message: actionMessage(code),
          });
  }
  for (const change of changes)
    if (
      managerChanges.has(change.id) &&
      graph.get(change.fields.managerId!)?.status === "LEFT"
    )
      rowChanges.get(change.id)!.errors.push({
        field: "manager_email",
        message: actionMessage("MANAGER_LEFT"),
      });
  return {
    fileHash,
    baseline,
    changes,
    planHash: digest(
      JSON.stringify({
        changes: changes.map((row) => ({ id: row.id, fields: row.fields })),
        proposed,
      }),
    ),
    preview: {
      rows,
      references: proposed,
      encoding: csv.encoding,
      delimiter: csv.delimiter,
      immediateDepartures,
      activeLinkedDepartures,
      reentries,
      hasErrors: rows.some((row) => row.errors.length > 0),
      totals: {
        created: rows.filter((row) => row.operation === "create").length,
        updated: rows.filter((row) => row.operation === "update").length,
        unchanged: rows.filter((row) => row.operation === "unchanged").length,
      },
    },
  };
}
export type EmployeeImportPreview = Awaited<
  ReturnType<typeof previewEmployeeImport>
>;
export async function previewEmployeeImport(
  db: PrismaClient,
  actor: Actor,
  bytes: Uint8Array,
  input: unknown = {},
) {
  const options = csvOptionsSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      await lockStaff(tx);
      await lockUsers(tx, [actor.userId]);
      const { user } = await serviceAccess(tx, actor, {
        action: "employees:import",
        resource: "employees",
      });
      const plan = await buildImportPlan(tx, bytes, options, user.role);
      const receipt = await createReceipt(tx, "employee", actor, {
        fileHash: plan.fileHash,
        baseline: plan.baseline,
        planHash: plan.planHash,
        options,
      });
      return {
        ...plan.preview,
        ...receipt,
        options,
      };
    },
    { timeout: 30_000 },
  );
}
export async function confirmEmployeeImport(
  db: PrismaClient,
  actor: Actor,
  bytes: Uint8Array,
  input: unknown,
) {
  const data = importConfirmationSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      await lockStaff(tx);
      const { user } = await serviceAccess(tx, actor, {
        action: "employees:import",
        resource: "employees",
      });
      const recorded = await readReceipt(
        tx,
        "employee",
        actor,
        data.previewId,
        bytes,
        data.options,
      );
      const plan = await buildImportPlan(tx, bytes, data.options, user.role);
      validateReceipt(recorded, plan);
      if (plan.preview.hasErrors)
        throw new ServiceError("IMPORT_HAS_ERRORS", 422);
      const approved = new Set(data.approvedReferences);
      if (
        approved.size !== plan.preview.references.length ||
        !plan.preview.references.every((ref) => approved.has(ref.id))
      )
        throw new ServiceError("REFERENCES_NOT_APPROVED");
      await lockEmployeeChanges(tx, actor, plan.changes);
      // These creations are rolled back together with any subsequent validation or write failure.
      for (const ref of plan.preview.references) {
        if (ref.kind === "organizations")
          await tx.organization.create({
            data: { id: ref.id, name: ref.name },
          });
        else
          await tx.department.create({
            data: {
              id: ref.id,
              name: ref.name,
              organizationId: ref.organizationId!,
            },
          });
        await writeAudit(tx, {
          action: "REFERENCE_CREATED",
          userId: actor.userId,
          entityType:
            ref.kind === "organizations" ? "Organization" : "Department",
          entityId: ref.id,
          changes: {
            fields:
              ref.kind === "organizations"
                ? ["name"]
                : ["name", "organizationId"],
          },
        });
      }
      await validateEmployeeChanges(tx, actor, plan.changes, data);
      await consumeReceipt(tx, "employee", actor, data.previewId);
      const totals = await persistEmployeeChanges(
        tx,
        actor,
        plan.changes,
        data.deactivateAccount,
      );
      await writeAudit(tx, {
        action: "EMPLOYEES_IMPORTED",
        userId: actor.userId,
        entityType: "Employee",
        changes: {
          ...totals,
          organizations: plan.preview.references.filter(
            (ref) => ref.kind === "organizations",
          ).length,
          departments: plan.preview.references.filter(
            (ref) => ref.kind === "departments",
          ).length,
        },
      });
      return totals;
    },
    { timeout: 120_000 },
  );
}
