import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { lockInventory } from "@/server/locks";
import {
  serviceAccess,
  lockUsers,
  type Actor,
} from "@/server/auth/service-access";
import { writeAudit } from "./audit";
import { ServiceError } from "./errors";
export { supplierMutationSchema } from "@/lib/equipment-reference-validation";
import { supplierMutationSchema } from "@/lib/equipment-reference-validation";
export async function listSuppliers(db: PrismaClient, actor: Actor) {
  await serviceAccess(db, actor, { action: "read", resource: "suppliers" });
  return (await db.supplier.findMany({ orderBy: { name: "asc" } })).map(
    (r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }),
  );
}
export async function mutateSupplier(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const data = supplierMutationSchema.parse(input);
  try {
    return await db.$transaction(
      async (tx) => {
        await lockInventory(tx);
        await lockUsers(tx, [actor.userId]);
        await serviceAccess(tx, actor, {
          action:
            data.operation === "delete"
              ? "archive"
              : data.id
                ? "update"
                : "create",
          resource: "suppliers",
        });
        const old = data.id
          ? await tx.supplier.findUnique({ where: { id: data.id } })
          : null;
        if (data.id && (!old || old.updatedAt.toISOString() !== data.updatedAt))
          throw new ServiceError("STALE_RECORD", 409);
        if (data.operation === "delete") {
          if (!old) throw new ServiceError("NOT_FOUND", 404);
          await tx.$queryRawUnsafe(
            'SELECT "id" FROM "Supplier" WHERE "id"=$1 FOR UPDATE',
            old.id,
          );
          const counts = {
            equipment: await tx.equipment.count({
              where: { supplierId: old.id },
            }),
            software: await tx.software.count({
              where: { supplierId: old.id },
            }),
            invoices: await tx.invoice.count({ where: { supplierId: old.id } }),
          };
          if (Object.values(counts).some(Boolean))
            throw new ServiceError("REFERENCE_IN_USE", 409, counts);
          await tx.supplier.delete({ where: { id: old.id } });
          await writeAudit(tx, {
            action: "SUPPLIER_DELETED",
            userId: actor.userId,
            entityType: "Supplier",
            entityId: old.id,
            changes: { fields: [] },
          });
          return { id: old.id };
        }
        const fields = {
          name: data.name,
          email: data.email,
          phone: data.phone,
          website: data.website,
          notes: data.notes,
        };
        const saved = old
          ? await tx.supplier.update({ where: { id: old.id }, data: fields })
          : await tx.supplier.create({ data: fields });
        await writeAudit(tx, {
          action: old ? "SUPPLIER_UPDATED" : "SUPPLIER_CREATED",
          userId: actor.userId,
          entityType: "Supplier",
          entityId: saved.id,
          changes: { fields: Object.keys(fields) },
        });
        return { id: saved.id };
      },
      { timeout: 20000 },
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002")
      throw new ServiceError("DUPLICATE_REFERENCE", 409);
    throw error;
  }
}
