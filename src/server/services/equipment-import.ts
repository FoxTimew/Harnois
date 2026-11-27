import "server-only";
import { z } from "zod";
import type {
  Prisma,
  PrismaClient,
  Equipment,
} from "@/generated/prisma/client";
import { readEquipmentCsv } from "@/server/imports/equipment-csv";
import { csvOptionsSchema } from "@/server/imports/csv";
import {
  digest,
  createReceipt,
  readReceipt,
  validateReceipt,
  consumeReceipt,
} from "@/server/imports/receipt";
import {
  equipmentFieldsSchema,
  equipmentStatusLabels,
  conditionLabels,
  parseEquipmentLabel,
  type EquipmentFields,
} from "@/lib/equipment-validation";
import { emailSchema } from "@/lib/validation";
import { recordId } from "@/lib/admin-validation";
import { parseCivilDate, todayInParis, dateOnly } from "@/lib/date-only";
import { actionMessage } from "@/lib/action-result";
import { lockInventory } from "@/server/locks";
import {
  serviceAccess,
  lockUsers,
  type Actor,
} from "@/server/auth/service-access";
import { categoryPath } from "./categories";
import {
  equipmentFields,
  validateEquipment,
  persistEquipment,
} from "./equipment";
import { assignEquipmentInTransaction } from "./equipment-assignments";
import { writeAudit } from "./audit";
import { ServiceError } from "./errors";

export const equipmentImportConfirmationSchema = z
  .object({
    previewId: recordId,
    options: csvOptionsSchema,
    approvedReferences: z.array(recordId).max(2000),
  })
  .strict();
type Reference = {
  id: string;
  kind: "category" | "supplier";
  name: string;
  parentId: string | null;
};
type ImportRow = {
  line: number;
  assetTag: string;
  name: string;
  status: string;
  operation: "create" | "update" | "unchanged";
  errors: { field: string; message: string }[];
};
type Change = {
  old: Equipment | null;
  fields: EquipmentFields;
  employeeId: string | null;
  expectedReturnDate: string | null;
  assignmentId: string | null;
  needsAssignment: boolean;
  unchanged: boolean;
};
async function buildPlan(
  tx: Prisma.TransactionClient,
  bytes: Uint8Array,
  options: unknown,
) {
  const fieldColumns: Record<string, string> = {
    assetTag: "numero_inventaire",
    name: "designation",
    brand: "marque",
    model: "modele",
    serialNumber: "numero_serie",
    categoryId: "categorie",
    supplierId: "fournisseur",
    locationId: "site",
    purchasePrice: "prix_achat",
    purchaseDate: "date_achat",
    warrantyEndDate: "fin_garantie",
    depreciationMonths: "amortissement_mois",
    status: "statut",
    condition: "etat",
  };
  const csv = readEquipmentCsv(bytes, options),
    fileHash = digest(bytes);
  const [equipment, categories, suppliers, locations, employees, assignments] =
    await Promise.all([
      tx.equipment.findMany({ orderBy: { id: "asc" } }),
      tx.category.findMany({ orderBy: { id: "asc" } }),
      tx.supplier.findMany({ orderBy: { id: "asc" } }),
      tx.location.findMany({ orderBy: { id: "asc" } }),
      tx.employee.findMany({
        select: { id: true, email: true, status: true, updatedAt: true },
        orderBy: { id: "asc" },
      }),
      tx.equipmentAssignment.findMany({
        where: { returnedAt: null },
        orderBy: { id: "asc" },
      }),
    ]);
  const baseline = digest(
    JSON.stringify({
      equipment: equipment.map((r) => [r.id, r.updatedAt]),
      categories,
      suppliers,
      locations,
      employees,
      assignments,
    }),
  );
  const references: Reference[] = [],
    changes: Change[] = [],
    rows: ImportRow[] = [];
  const categoryIds = new Map(
    categories.map((c) => [categoryPath(categories, c.id), c.id]),
  );
  const supplierIds = new Map(suppliers.map((s) => [s.name, s.id]));
  const seenTags = new Set<string>(),
    seenSerials = new Set<string>();
  function category(name: string) {
    const pathId = categoryIds.get(name);
    if (pathId) return pathId;
    const named = categories.find((c) => c.name === name);
    if (named) return named.id;
    const parts = name.split(">").map((s) => s.trim());
    if (parts.some((s) => !s || s.length > 100) || parts.length > 32)
      throw new ServiceError("INVALID_CATEGORY_PATH");
    let parentId: string | null = null,
      path = "";
    for (const part of parts) {
      path = path ? path + " > " + part : part;
      let id = categoryIds.get(path);
      if (!id) {
        if (
          categories.some((c) => c.name === part) ||
          references.some((r) => r.kind === "category" && r.name === part)
        )
          throw new ServiceError("DUPLICATE_REFERENCE");
        id = "imp_cat_" + digest(path).slice(0, 32);
        categoryIds.set(path, id);
        references.push({ id, kind: "category", name: part, parentId });
      }
      parentId = id;
    }
    return parentId!;
  }
  for (const record of csv.records) {
    const c = record.cells,
      errors: ImportRow["errors"] = [];
    const fail = (field: string, message: string) =>
      errors.push({ field, message });
    const tag = c.numero_inventaire?.toUpperCase() || null;
    const old = tag
      ? (equipment.find((e) => e.assetTag === tag) ?? null)
      : null;
    const base: Record<string, unknown> = old
      ? equipmentFields(old)
      : { name: "", categoryId: "", status: "IN_STOCK", condition: "NEW" };
    const active = old
      ? assignments.find((a) => a.equipmentId === old.id)
      : undefined;
    let employeeId = active?.employeeId ?? null,
      expectedReturnDate = dateOnly(active?.expectedReturnDate ?? null);
    if (record.invalidLength)
      fail("ligne", "Le nombre de cellules ne correspond pas aux colonnes.");
    if (tag) {
      if (seenTags.has(tag))
        fail("numero_inventaire", "Numéro répété dans le fichier.");
      seenTags.add(tag);
      base.assetTag = tag;
    }
    const textFields = {
      designation: "name",
      marque: "brand",
      modele: "model",
      numero_serie: "serialNumber",
    } as const;
    for (const [column, key] of Object.entries(textFields)) {
      const v = c[column as keyof typeof c];
      if (v) base[key] = v === "__CLEAR__" ? null : v;
    }
    try {
      if (c.categorie) base.categoryId = category(c.categorie);
      if (c.fournisseur) {
        if (c.fournisseur === "__CLEAR__") base.supplierId = null;
        else {
          if (c.fournisseur.length > 120)
            throw new ServiceError("INVALID_REQUEST");
          let id = supplierIds.get(c.fournisseur);
          if (!id) {
            id = "imp_sup_" + digest(c.fournisseur).slice(0, 32);
            supplierIds.set(c.fournisseur, id);
            references.push({
              id,
              kind: "supplier",
              name: c.fournisseur,
              parentId: null,
            });
          }
          base.supplierId = id;
        }
      }
      if (c.site) {
        base.locationId =
          c.site === "__CLEAR__"
            ? null
            : locations.find((l) => l.name === c.site)?.id;
        if (base.locationId === undefined)
          fail("site", "Site inconnu : créez-le dans les référentiels.");
      }
      if (c.statut)
        base.status = parseEquipmentLabel(c.statut, equipmentStatusLabels);
      if (c.etat) base.condition = parseEquipmentLabel(c.etat, conditionLabels);
      for (const [column, key] of [
        ["date_achat", "purchaseDate"],
        ["fin_garantie", "warrantyEndDate"],
      ] as const) {
        const v = c[column];
        if (v) base[key] = v === "__CLEAR__" ? null : parseCivilDate(v);
      }
      if (c.prix_achat)
        base.purchasePrice = c.prix_achat === "__CLEAR__" ? null : c.prix_achat;
      if (c.amortissement_mois)
        base.depreciationMonths =
          c.amortissement_mois === "__CLEAR__"
            ? null
            : /^\d+$/.test(c.amortissement_mois)
              ? Number(c.amortissement_mois)
              : NaN;
      if (c.employe_email) {
        if (c.employe_email === "__CLEAR__") {
          if (active)
            fail(
              "employe_email",
              "Effectuez d’abord le retour sur la fiche équipement.",
            );
          employeeId = null;
        } else {
          const email = emailSchema.parse(c.employe_email),
            employee = employees.find((e) => e.email === email);
          if (!employee || employee.status === "LEFT")
            fail("employe_email", "Employé inconnu ou parti.");
          else employeeId = employee.id;
        }
      }
      if (c.retour_prevu)
        expectedReturnDate =
          c.retour_prevu === "__CLEAR__"
            ? null
            : parseCivilDate(c.retour_prevu);
      if (employeeId && !active && !c.statut)
        base.status = expectedReturnDate ? "LOANED" : "ASSIGNED";
    } catch {
      fail(
        "ligne",
        "Vérifiez le statut, les dates, l’email et les référentiels.",
      );
    }
    const parsed = equipmentFieldsSchema.safeParse(base);
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        fail(
          fieldColumns[String(issue.path[0])] ?? "ligne",
          /^(Invalid|Too|Expected)/.test(issue.message)
            ? "Valeur manquante ou invalide."
            : issue.message,
        );
    if (parsed.success) {
      const fields = parsed.data;
      if (fields.serialNumber) {
        if (
          seenSerials.has(fields.serialNumber) ||
          equipment.some(
            (e) => e.id !== old?.id && e.serialNumber === fields.serialNumber,
          )
        )
          fail(
            "numero_serie",
            "Numéro de série déjà utilisé : aucun rapprochement automatique.",
          );
        seenSerials.add(fields.serialNumber);
      }
      const assigned = ["ASSIGNED", "LOANED"].includes(fields.status),
        needsAssignment = assigned && !active;
      if (active && employeeId !== active.employeeId)
        fail(
          "employe_email",
          "Effectuez le retour avant de changer de détenteur.",
        );
      if (assigned && !employeeId)
        fail("employe_email", "Un statut assigné ou en prêt exige un employé.");
      if (employeeId && !assigned)
        fail("statut", "L’employé assigné exige le statut Assigné ou En prêt.");
      if (
        fields.status === "LOANED" &&
        (!expectedReturnDate ||
          (expectedReturnDate < todayInParis() &&
            (!active ||
              dateOnly(active.expectedReturnDate) !== expectedReturnDate)))
      )
        fail(
          "retour_prevu",
          "Un prêt exige une date de retour prévue non passée.",
        );
      if (fields.status !== "LOANED" && expectedReturnDate)
        fail(
          "retour_prevu",
          "La date de retour prévue est réservée aux prêts.",
        );
      if (old?.status === "LOST" && fields.status !== old.status)
        fail(
          "statut",
          "Renseignez une note de récupération sur la fiche avant l’import.",
        );
      if (needsAssignment && old && old.status !== "IN_STOCK")
        fail("statut", "L’équipement doit être en stock avant l’assignation.");
      try {
        await validateEquipment(
          tx,
          { ...fields, status: needsAssignment ? "IN_STOCK" : fields.status },
          old,
          "Import CSV confirmé",
          {
            categories: [
              ...categories,
              ...references
                .filter((r) => r.kind === "category")
                .map((r) => ({ ...r, specDefinitions: [] })),
            ],
            supplierIds: new Set([
              ...suppliers.map((s) => s.id),
              ...references
                .filter((r) => r.kind === "supplier")
                .map((r) => r.id),
            ]),
            locationIds: new Set(locations.map((l) => l.id)),
          },
        );
      } catch (e) {
        fail(
          "ligne",
          actionMessage(e instanceof ServiceError ? e.code : "INVALID_REQUEST"),
        );
      }
      const unchanged =
        old &&
        JSON.stringify(fields) ===
          JSON.stringify(equipmentFieldsSchema.parse(equipmentFields(old))) &&
        dateOnly(active?.expectedReturnDate ?? null) === expectedReturnDate;
      changes.push({
        unchanged: Boolean(unchanged),
        old,
        fields,
        employeeId,
        expectedReturnDate,
        assignmentId: active?.id ?? null,
        needsAssignment,
      });
      rows.push({
        line: record.line,
        assetTag: tag ?? "Attribué à la confirmation",
        name: fields.name,
        status: equipmentStatusLabels[fields.status],
        operation: old ? (unchanged ? "unchanged" : "update") : "create",
        errors,
      });
    } else
      rows.push({
        line: record.line,
        assetTag: tag ?? "À générer",
        name: c.designation ?? "",
        status: c.statut ?? "",
        operation: old ? "update" : "create",
        errors,
      });
  }
  const totals = {
    created: rows.filter((r) => r.operation === "create").length,
    updated: rows.filter((r) => r.operation === "update").length,
    unchanged: rows.filter((r) => r.operation === "unchanged").length,
  };
  return {
    fileHash,
    baseline,
    planHash: digest(
      JSON.stringify({
        changes: changes.map((c) => ({ ...c, old: c.old?.id ?? null })),
        references,
      }),
    ),
    changes,
    preview: {
      rows,
      references,
      encoding: csv.encoding,
      delimiter: csv.delimiter,
      totals,
      hasErrors: rows.some((r) => r.errors.length > 0),
    },
  };
}
export type EquipmentImportPreview = Awaited<
  ReturnType<typeof previewEquipmentImport>
>;
export async function previewEquipmentImport(
  db: PrismaClient,
  actor: Actor,
  bytes: Uint8Array,
  input: unknown = {},
) {
  const options = csvOptionsSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      await lockInventory(tx);
      await lockUsers(tx, [actor.userId]);
      await serviceAccess(tx, actor, {
        action: "equipment:import",
        resource: "equipment",
      });
      const plan = await buildPlan(tx, bytes, options),
        receipt = await createReceipt(tx, "equipment", actor, {
          fileHash: plan.fileHash,
          baseline: plan.baseline,
          planHash: plan.planHash,
          options,
        });
      return { ...plan.preview, ...receipt, options };
    },
    { timeout: 60000 },
  );
}
export async function confirmEquipmentImport(
  db: PrismaClient,
  actor: Actor,
  bytes: Uint8Array,
  input: unknown,
) {
  const data = equipmentImportConfirmationSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      await lockInventory(tx);
      await lockUsers(tx, [actor.userId]);
      await serviceAccess(tx, actor, {
        action: "equipment:import",
        resource: "equipment",
      });
      const recorded = await readReceipt(
          tx,
          "equipment",
          actor,
          data.previewId,
          bytes,
          data.options,
        ),
        plan = await buildPlan(tx, bytes, data.options);
      validateReceipt(recorded, plan);
      if (plan.preview.hasErrors)
        throw new ServiceError("IMPORT_HAS_ERRORS", 422);
      const approved = new Set(data.approvedReferences);
      if (
        approved.size !== plan.preview.references.length ||
        !plan.preview.references.every((r) => approved.has(r.id))
      )
        throw new ServiceError("REFERENCES_NOT_APPROVED");
      for (const ref of plan.preview.references) {
        if (ref.kind === "category")
          await tx.category.create({
            data: { id: ref.id, name: ref.name, parentId: ref.parentId },
          });
        else await tx.supplier.create({ data: { id: ref.id, name: ref.name } });
        await writeAudit(tx, {
          action:
            ref.kind === "category" ? "CATEGORY_CREATED" : "SUPPLIER_CREATED",
          userId: actor.userId,
          entityType: ref.kind === "category" ? "Category" : "Supplier",
          entityId: ref.id,
          changes: { fields: ["name"] },
        });
      }
      for (const change of plan.changes) {
        if (change.unchanged) continue;
        const { fields, old, needsAssignment } = change;
        const savedFields = {
          ...fields,
          status: needsAssignment ? ("IN_STOCK" as const) : fields.status,
        };
        await validateEquipment(tx, savedFields, old, "Import CSV confirmé");
        const saved = await persistEquipment(tx, actor, savedFields, old);
        if (needsAssignment)
          await assignEquipmentInTransaction(tx, actor, {
            equipmentId: saved.id,
            employeeId: change.employeeId,
            kind: fields.status === "LOANED" ? "LOAN" : "PERMANENT",
            conditionOut: fields.condition,
            expectedReturnDate: change.expectedReturnDate,
          });
        else if (change.assignmentId) {
          const existing = await tx.equipmentAssignment.findUniqueOrThrow({
            where: { id: change.assignmentId },
          });
          if (
            dateOnly(existing.expectedReturnDate) !== change.expectedReturnDate
          ) {
            if (
              existing.kind !== "LOAN" ||
              !change.expectedReturnDate ||
              change.expectedReturnDate < todayInParis()
            )
              throw new ServiceError("LOAN_DATE_REQUIRED");
            await tx.equipmentAssignment.update({
              where: { id: existing.id },
              data: { expectedReturnDate: new Date(change.expectedReturnDate) },
            });
            await writeAudit(tx, {
              action: "LOAN_DATE_CHANGED",
              userId: actor.userId,
              entityType: "Assignment",
              entityId: existing.id,
              changes: {
                equipmentId: saved.id,
                employeeId: existing.employeeId,
              },
            });
          }
        }
      }
      await consumeReceipt(tx, "equipment", actor, data.previewId);
      await writeAudit(tx, {
        action: "EQUIPMENT_IMPORTED",
        userId: actor.userId,
        entityType: "Equipment",
        changes: {
          ...plan.preview.totals,
          categories: plan.preview.references.filter(
            (r) => r.kind === "category",
          ).length,
          suppliers: plan.preview.references.filter(
            (r) => r.kind === "supplier",
          ).length,
        },
      });
      return plan.preview.totals;
    },
    { timeout: 120000 },
  );
}
