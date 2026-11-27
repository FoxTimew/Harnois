import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  specDefinitionsSchema,
  specsSchema,
  specsMatch,
  type SpecDefinition,
} from "@/lib/equipment-specs";
import { lockInventory } from "@/server/locks";
import {
  serviceAccess,
  lockUsers,
  type Actor,
} from "@/server/auth/service-access";
import { writeAudit } from "./audit";
import { ServiceError } from "./errors";
export {
  categoryMutationSchema,
  categoryIcons,
} from "@/lib/equipment-reference-validation";
import { categoryMutationSchema } from "@/lib/equipment-reference-validation";
export type CategoryNode = {
  id: string;
  name: string;
  parentId: string | null;
  specDefinitions: unknown;
};
export function inheritedDefinitions(
  nodes: CategoryNode[],
  id: string,
): SpecDefinition[] {
  const chain: CategoryNode[] = [];
  const seen = new Set<string>();
  let current: string | null = id;
  while (current) {
    if (seen.has(current)) throw new ServiceError("CATEGORY_CYCLE");
    seen.add(current);
    const row = nodes.find((x) => x.id === current);
    if (!row) throw new ServiceError("REFERENCE_NOT_FOUND");
    chain.unshift(row);
    current = row.parentId;
  }
  const fields = new Map<string, SpecDefinition>();
  for (const row of chain)
    for (const field of specDefinitionsSchema.parse(row.specDefinitions)) {
      if (fields.has(field.key)) throw new ServiceError("DUPLICATE_SPEC_KEY");
      fields.set(field.key, field);
    }
  if (fields.size > 64) throw new ServiceError("INVALID_SPECS");
  return [...fields.values()];
}
export function categoryDescendants(nodes: CategoryNode[], id: string) {
  if (!nodes.some((n) => n.id === id))
    throw new ServiceError("REFERENCE_NOT_FOUND");
  const result = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes)
      if (node.parentId && result.has(node.parentId) && !result.has(node.id)) {
        result.add(node.id);
        changed = true;
      }
  }
  return [...result];
}
export function categoryPath(nodes: CategoryNode[], id: string) {
  const path: string[] = [];
  const seen = new Set<string>();
  let row = nodes.find((n) => n.id === id);
  while (row) {
    if (seen.has(row.id)) throw new ServiceError("CATEGORY_CYCLE");
    seen.add(row.id);
    path.unshift(row.name);
    row = nodes.find((n) => n.id === row!.parentId);
  }
  return path.join(" > ");
}
export async function listCategories(db: PrismaClient, actor: Actor) {
  await serviceAccess(db, actor, { action: "read", resource: "categories" });
  const rows = await db.category.findMany({ orderBy: { name: "asc" } });
  return rows.map((r) => ({
    ...r,
    updatedAt: r.updatedAt.toISOString(),
    specDefinitions: specDefinitionsSchema.parse(r.specDefinitions),
    inherited: inheritedDefinitions(rows, r.id),
    path: categoryPath(rows, r.id),
  }));
}
export async function mutateCategory(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const data = categoryMutationSchema.parse(input);
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
          resource: "categories",
        });
        const rows = await tx.category.findMany();
        const old = rows.find((r) => r.id === data.id);
        if (data.id && (!old || old.updatedAt.toISOString() !== data.updatedAt))
          throw new ServiceError("STALE_RECORD", 409);
        if (data.operation === "delete") {
          if (!old) throw new ServiceError("NOT_FOUND", 404);
          await tx.$queryRawUnsafe(
            'SELECT "id" FROM "Category" WHERE "id"=$1 FOR UPDATE',
            old.id,
          );
          const counts = {
            children: await tx.category.count({ where: { parentId: old.id } }),
            equipment: await tx.equipment.count({
              where: { categoryId: old.id },
            }),
          };
          if (Object.values(counts).some(Boolean))
            throw new ServiceError("REFERENCE_IN_USE", 409, counts);
          await tx.category.delete({ where: { id: old.id } });
          await writeAudit(tx, {
            action: "CATEGORY_DELETED",
            userId: actor.userId,
            entityType: "Category",
            entityId: old.id,
            changes: { fields: [] },
          });
          return { id: old.id };
        }
        const id = old?.id ?? "new-category";
        const next = [...rows.filter((r) => r.id !== id), { ...data, id }];
        for (const row of next) inheritedDefinitions(next, row.id);
        if (old) {
          const previous = specDefinitionsSchema.parse(old.specDefinitions);
          for (const field of previous) {
            const replacement = data.specDefinitions.find(
              (f) => f.key === field.key,
            );
            if (replacement && replacement.type !== field.type)
              throw new ServiceError("IMMUTABLE_SPEC_TYPE");
          }
          const affected = categoryDescendants(rows, id);
          const equipment = await tx.equipment.findMany({
            where: { categoryId: { in: affected } },
            select: { categoryId: true, specs: true },
          });
          for (const item of equipment) {
            const values = specsSchema.parse(item.specs ?? {});
            const defs = inheritedDefinitions(next, item.categoryId);
            const before = inheritedDefinitions(rows, item.categoryId);
            if (
              Object.keys(values).some(
                (key) =>
                  !defs.some(
                    (d) =>
                      d.key === key &&
                      d.type === before.find((p) => p.key === key)?.type,
                  ),
              ) ||
              !specsMatch(defs, values, values)
            )
              throw new ServiceError("SPEC_IN_USE");
          }
        }
        const fields = {
          name: data.name,
          icon: data.icon,
          parentId: data.parentId,
          specDefinitions: data.specDefinitions as Prisma.InputJsonValue,
        };
        const saved = old
          ? await tx.category.update({ where: { id: old.id }, data: fields })
          : await tx.category.create({ data: fields });
        await writeAudit(tx, {
          action: old ? "CATEGORY_UPDATED" : "CATEGORY_CREATED",
          userId: actor.userId,
          entityType: "Category",
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
