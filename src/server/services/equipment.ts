import "server-only";
import {
  Prisma,
  type PrismaClient,
  type Equipment,
} from "@/generated/prisma/client";
import {
  equipmentMutationSchema,
  equipmentQuerySchema,
  directTransitions,
  equipmentStatusLabels,
  conditionLabels,
  equipmentIndicators,
  type EquipmentFields,
} from "@/lib/equipment-validation";
import { recordId } from "@/lib/admin-validation";
import { normalizeSearch, escapeSearchPattern } from "@/lib/search-text";
import { dateOnly, todayInParis } from "@/lib/date-only";
import { specsSchema, specsMatch } from "@/lib/equipment-specs";
import { csvRow } from "@/lib/csv";
import { lockInventory } from "@/server/locks";
import {
  serviceAccess,
  lockUsers,
  type Actor,
} from "@/server/auth/service-access";
import { can } from "@/server/auth/permissions";
import {
  categoryDescendants,
  categoryPath,
  inheritedDefinitions,
  type CategoryNode,
} from "./categories";
import { writeAudit } from "./audit";
import { ServiceError } from "./errors";

export const equipmentSearchText = (
  row: Pick<
    EquipmentFields,
    "name" | "brand" | "model" | "serialNumber" | "assetTag"
  >,
) =>
  normalizeSearch(
    [row.name, row.brand, row.model, row.serialNumber, row.assetTag]
      .filter(Boolean)
      .join(" "),
  );
export function equipmentFields(row: Equipment): EquipmentFields {
  return {
    assetTag: row.assetTag,
    name: row.name,
    brand: row.brand,
    model: row.model,
    serialNumber: row.serialNumber,
    status: row.status,
    condition: row.condition,
    categoryId: row.categoryId,
    supplierId: row.supplierId,
    locationId: row.locationId,
    purchasePrice: row.purchasePrice?.toFixed(2) ?? null,
    purchaseDate: dateOnly(row.purchaseDate),
    warrantyEndDate: dateOnly(row.warrantyEndDate),
    depreciationMonths: row.depreciationMonths,
    specs: specsSchema.parse(row.specs ?? {}),
    notes: row.notes,
  };
}
export async function validateEquipment(
  tx: Prisma.TransactionClient,
  fields: EquipmentFields,
  old: Equipment | null,
  reason: string,
  references?: {
    categories: CategoryNode[];
    supplierIds: Set<string>;
    locationIds: Set<string>;
  },
) {
  const nodes = references?.categories ?? (await tx.category.findMany());
  if (!nodes.some((c) => c.id === fields.categoryId))
    throw new ServiceError("REFERENCE_NOT_FOUND");
  if (
    fields.supplierId &&
    !(references
      ? references.supplierIds.has(fields.supplierId)
      : await tx.supplier.count({ where: { id: fields.supplierId } }))
  )
    throw new ServiceError("REFERENCE_NOT_FOUND");
  if (
    fields.locationId &&
    !(references
      ? references.locationIds.has(fields.locationId)
      : await tx.location.count({ where: { id: fields.locationId } }))
  )
    throw new ServiceError("REFERENCE_NOT_FOUND");
  if (!old && ["ASSIGNED", "LOANED"].includes(fields.status))
    throw new ServiceError("ASSIGNMENT_REQUIRED");
  if (old && old.status !== fields.status) {
    if (!directTransitions[old.status].includes(fields.status))
      throw new ServiceError("INVALID_STATUS_TRANSITION");
    if (!reason) throw new ServiceError("REASON_REQUIRED");
    if (
      await tx.equipmentAssignment.count({
        where: { equipmentId: old.id, returnedAt: null },
      })
    )
      throw new ServiceError("EQUIPMENT_ASSIGNED");
  }
  if (fields.status === "IN_STOCK" && fields.condition === "DAMAGED")
    throw new ServiceError("DAMAGED_EQUIPMENT");
  if (
    old &&
    ["ASSIGNED", "LOANED"].includes(old.status) &&
    fields.condition !== old.condition
  )
    throw new ServiceError("RETURN_REQUIRED");
  const definitions = inheritedDefinitions(nodes, fields.categoryId),
    previous = specsSchema.parse(old?.specs ?? {});
  if (!specsMatch(definitions, fields.specs, previous))
    throw new ServiceError("INVALID_SPECS");
  for (const [key, value] of Object.entries(previous)) {
    const d = definitions.find((d) => d.key === key);
    if ((!d || d.disabled) && fields.specs[key] !== value)
      throw new ServiceError("SPEC_IN_USE");
  }
  if (
    old &&
    old.categoryId !== fields.categoryId &&
    Object.keys(fields.specs).some((k) => !definitions.some((d) => d.key === k))
  )
    throw new ServiceError("SPEC_IN_USE");
}
export async function persistEquipment(
  tx: Prisma.TransactionClient,
  actor: Actor,
  fields: EquipmentFields,
  old: Equipment | null,
) {
  let number: number | undefined,
    assetTag = fields.assetTag;
  if (!old) {
    do {
      const rows = await tx.$queryRawUnsafe<{ number: number }[]>(
        "SELECT nextval(pg_get_serial_sequence('\"Equipment\"', 'inventoryNumber'))::integer AS number",
      );
      number = rows[0].number;
      if (fields.assetTag) break;
      assetTag = "HRN-" + String(number).padStart(6, "0");
    } while (
      await tx.equipment.findUnique({
        where: { assetTag: assetTag! },
        select: { id: true },
      })
    );
  } else if (!assetTag) assetTag = old.assetTag;
  const data = {
    ...fields,
    assetTag: assetTag!,
    searchText: equipmentSearchText({ ...fields, assetTag }),
    specs: fields.specs as Prisma.InputJsonValue,
    purchasePrice:
      fields.purchasePrice === undefined
        ? undefined
        : fields.purchasePrice === null
          ? null
          : new Prisma.Decimal(fields.purchasePrice),
    purchaseDate: fields.purchaseDate ? new Date(fields.purchaseDate) : null,
    warrantyEndDate: fields.warrantyEndDate
      ? new Date(fields.warrantyEndDate)
      : null,
  };
  const row = old
    ? await tx.equipment.update({ where: { id: old.id }, data })
    : await tx.equipment.create({ data: { ...data, inventoryNumber: number } });
  await writeAudit(tx, {
    action: !old
      ? "EQUIPMENT_CREATED"
      : row.status === "RETIRED" && old.status !== "RETIRED"
        ? "EQUIPMENT_ARCHIVED"
        : "EQUIPMENT_UPDATED",
    userId: actor.userId,
    entityType: "Equipment",
    entityId: row.id,
    changes: {
      fields: Object.keys(fields),
      ...(old && old.status !== row.status
        ? { before: old.status, after: row.status }
        : {}),
    },
  });
  return row;
}
export async function mutateEquipment(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const data = equipmentMutationSchema.parse(input);
  try {
    return await db.$transaction(
      async (tx) => {
        await lockInventory(tx);
        await lockUsers(tx, [actor.userId]);
        const { user } = await serviceAccess(tx, actor, {
          action: data.id ? "update" : "create",
          resource: "equipment",
        });
        if (
          data.fields.purchasePrice !== undefined &&
          !can(user, "financials:read", { type: "financials" })
        )
          throw new ServiceError("FORBIDDEN", 403);
        const old = data.id
          ? await tx.equipment.findUnique({ where: { id: data.id } })
          : null;
        if (data.id && (!old || data.updatedAt !== old.updatedAt.toISOString()))
          throw new ServiceError("STALE_RECORD", 409);
        await validateEquipment(tx, data.fields, old, data.reason);
        const fields = { ...data.fields };
        if (old && old.status !== fields.status) {
          fields.notes = [
            fields.notes,
            "[" +
              new Date().toISOString() +
              "] " +
              equipmentStatusLabels[old.status] +
              " → " +
              equipmentStatusLabels[fields.status] +
              " : " +
              data.reason,
          ]
            .filter(Boolean)
            .join("\n");
          if (fields.notes.length > 2000)
            throw new ServiceError("NOTES_TOO_LONG");
        }
        const saved = await persistEquipment(tx, actor, fields, old);
        return { id: saved.id };
      },
      { timeout: 20000 },
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002")
      throw new ServiceError("DUPLICATE_EQUIPMENT", 409);
    throw error;
  }
}
export const equipmentSelect = {
  id: true,
  assetTag: true,
  name: true,
  brand: true,
  model: true,
  serialNumber: true,
  status: true,
  condition: true,
  specs: true,
  notes: true,
  categoryId: true,
  supplierId: true,
  locationId: true,
  purchaseDate: true,
  warrantyEndDate: true,
  depreciationMonths: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, icon: true } },
  supplier: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  assignments: {
    where: { returnedAt: null },
    select: {
      id: true,
      employeeId: true,
      kind: true,
      expectedReturnDate: true,
      assignedAt: true,
      employee: {
        select: { id: true, firstName: true, lastName: true, status: true },
      },
    },
  },
} satisfies Prisma.EquipmentSelect;
type SelectedEquipment = Prisma.EquipmentGetPayload<{
  select: typeof equipmentSelect;
}>;
export function equipmentDto(
  row: SelectedEquipment,
  price?: Prisma.Decimal | null,
) {
  const dates = {
    purchaseDate: dateOnly(row.purchaseDate),
    warrantyEndDate: dateOnly(row.warrantyEndDate),
  };
  return {
    ...row,
    ...dates,
    specs: specsSchema.parse(row.specs ?? {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    assignments: row.assignments.map((a) => ({
      ...a,
      expectedReturnDate: dateOnly(a.expectedReturnDate),
      assignedAt: a.assignedAt.toISOString(),
    })),
    ...(price !== undefined
      ? { purchasePrice: price?.toFixed(2) ?? null }
      : {}),
    ...equipmentIndicators({
      ...dates,
      depreciationMonths: row.depreciationMonths,
    }),
  };
}
export async function equipmentWhere(
  tx: Prisma.TransactionClient,
  query: ReturnType<typeof equipmentQuerySchema.parse>,
): Promise<Prisma.EquipmentWhereInput> {
  const today = todayInParis(),
    soon = new Date(today);
  soon.setUTCDate(soon.getUTCDate() + 60);
  return {
    ...(query.q
      ? { searchText: { contains: escapeSearchPattern(query.q) } }
      : {}),
    ...(query.categoryId
      ? {
          categoryId: {
            in: categoryDescendants(
              await tx.category.findMany(),
              query.categoryId,
            ),
          },
        }
      : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.locationId ? { locationId: query.locationId } : {}),
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    ...(query.warranty === "none"
      ? { warrantyEndDate: null }
      : query.warranty === "expired"
        ? { warrantyEndDate: { lt: new Date(today) } }
        : query.warranty === "soon"
          ? { warrantyEndDate: { gte: new Date(today), lte: soon } }
          : {}),
    ...(query.employeeId || query.departed
      ? {
          assignments: {
            some: {
              returnedAt: null,
              ...(query.employeeId ? { employeeId: query.employeeId } : {}),
              ...(query.departed ? { employee: { status: "LEFT" } } : {}),
            },
          },
        }
      : {}),
  };
}
export async function listEquipment(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const query = equipmentQuerySchema.parse(input);
  return db.$transaction(
    async (tx) => {
      const { user } = await serviceAccess(tx, actor, {
        action: "read",
        resource: "equipment",
      });
      const financial = can(user, "financials:read", { type: "financials" }),
        where = await equipmentWhere(tx, query);
      const total = await tx.equipment.count({ where });
      const rows = await tx.equipment.findMany({
        where,
        select: { ...equipmentSelect, purchasePrice: financial },
        orderBy: [{ [query.sort]: query.order }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      });
      return {
        query,
        total,
        rows: rows.map((r) =>
          equipmentDto(r, financial ? r.purchasePrice : undefined),
        ),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function equipmentDetail(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const id = recordId.parse(input);
  return db.$transaction(
    async (tx) => {
      const { user } = await serviceAccess(tx, actor);
      const employee = user.role === "EMPLOYEE";
      if (
        employee &&
        (!user.employeeId ||
          !(await tx.equipmentAssignment.count({
            where: {
              equipmentId: id,
              employeeId: user.employeeId,
              returnedAt: null,
            },
          })))
      )
        throw new ServiceError("FORBIDDEN", 403);
      const financial = can(user, "financials:read", { type: "financials" });
      const row = await tx.equipment.findUnique({
        where: { id },
        select: { ...equipmentSelect, purchasePrice: financial },
      });
      if (!row) throw new ServiceError("NOT_FOUND", 404);
      const history = await tx.equipmentAssignment.findMany({
        where: {
          equipmentId: id,
          ...(employee ? { employeeId: user.employeeId! } : {}),
        },
        orderBy: [{ assignedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          equipmentId: true,
          employeeId: true,
          assignedAt: true,
          returnedAt: true,
          conditionOut: true,
          conditionIn: true,
          kind: true,
          expectedReturnDate: true,
          closureReason: true,
          notes: !employee,
          returnNotes: !employee,
          employee: { select: { firstName: true, lastName: true } },
        },
      });
      const definitions = inheritedDefinitions(
        await tx.category.findMany(),
        row.categoryId,
      );
      const safeRow = employee
        ? {
            ...row,
            notes: null,
            assignments: row.assignments.filter(
              (a) => a.employeeId === user.employeeId,
            ),
          }
        : row;
      return {
        ...equipmentDto(safeRow, financial ? row.purchasePrice : undefined),
        definitions,
        history: history.map((h) => ({
          ...h,
          assignedAt: h.assignedAt.toISOString(),
          returnedAt: h.returnedAt?.toISOString() ?? null,
          expectedReturnDate: dateOnly(h.expectedReturnDate),
        })),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function equipmentOptions(db: PrismaClient, actor: Actor) {
  await serviceAccess(db, actor, { action: "read", resource: "equipment" });
  const [categories, suppliers, locations, employees] = await Promise.all([
    db.category.findMany({ orderBy: { name: "asc" } }),
    db.supplier.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.location.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.employee.findMany({
      where: { status: { not: "LEFT" } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);
  return {
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      definitions: inheritedDefinitions(categories, c.id),
    })),
    suppliers,
    locations,
    employees,
  };
}
export async function employeeEquipment(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const employeeId = recordId.parse(input);
  const { user } = await serviceAccess(db, actor, {
    action: "read",
    resource: { type: "assignments", ownerEmployeeId: employeeId },
  });
  const rows = await db.equipmentAssignment.findMany({
    where: { employeeId },
    orderBy: [{ assignedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      assignedAt: true,
      returnedAt: true,
      kind: true,
      expectedReturnDate: true,
      closureReason: true,
      conditionOut: true,
      conditionIn: true,
      equipment: {
        select: {
          id: true,
          assetTag: true,
          name: true,
          serialNumber: true,
          status: user.role !== "EMPLOYEE",
        },
      },
    },
  });
  return rows.map((r) => ({
    ...r,
    assignedAt: r.assignedAt.toISOString(),
    returnedAt: r.returnedAt?.toISOString() ?? null,
    expectedReturnDate: dateOnly(r.expectedReturnDate),
  }));
}
export async function exportEquipment(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const query = equipmentQuerySchema.parse(input);
  return db.$transaction(
    async (tx) => {
      await serviceAccess(tx, actor, {
        action: "equipment:export",
        resource: "equipment",
      });
      const where = await equipmentWhere(tx, query),
        count = await tx.equipment.count({ where });
      if (count > 10000) throw new ServiceError("EXPORT_TOO_LARGE");
      const rows = await tx.equipment.findMany({
        where,
        select: {
          ...equipmentSelect,
          purchasePrice: true,
          assignments: {
            where: { returnedAt: null },
            select: {
              expectedReturnDate: true,
              employee: { select: { email: true } },
            },
          },
        },
        orderBy: [{ [query.sort]: query.order }, { id: "asc" }],
      });
      let csv =
        "\uFEFF" +
        csvRow([
          "numero_inventaire",
          "designation",
          "categorie",
          "marque",
          "modele",
          "numero_serie",
          "statut",
          "etat",
          "date_achat",
          "prix_achat",
          "fin_garantie",
          "amortissement_mois",
          "fournisseur",
          "site",
          "employe_email",
          "retour_prevu",
        ]);
      const categories = await tx.category.findMany();
      for (const r of rows)
        csv += csvRow([
          r.assetTag,
          r.name,
          categoryPath(categories, r.categoryId),
          r.brand ?? "",
          r.model ?? "",
          r.serialNumber ?? "",
          equipmentStatusLabels[r.status],
          conditionLabels[r.condition],
          dateOnly(r.purchaseDate) ?? "",
          r.purchasePrice?.toFixed(2).replace(".", ",") ?? "",
          dateOnly(r.warrantyEndDate) ?? "",
          r.depreciationMonths?.toString() ?? "",
          r.supplier?.name ?? "",
          r.location?.name ?? "",
          r.assignments[0]?.employee.email ?? "",
          dateOnly(r.assignments[0]?.expectedReturnDate ?? null) ?? "",
        ]);
      const {
        categoryId,
        supplierId,
        locationId,
        employeeId,
        status,
        warranty,
        departed,
      } = query;
      await writeAudit(tx, {
        action: "EQUIPMENT_EXPORTED",
        userId: actor.userId,
        entityType: "Equipment",
        changes: {
          count,
          filters: {
            categoryId,
            supplierId,
            locationId,
            employeeId,
            status,
            warranty,
            departed,
            searchUsed: !!query.q,
          },
        },
      });
      return csv;
    },
    { isolationLevel: "RepeatableRead", timeout: 30000 },
  );
}
