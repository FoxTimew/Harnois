"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/require-user";
import { getDb } from "@/server/db";
import {
  categoryMutationSchema,
  mutateCategory,
} from "@/server/services/categories";
import {
  supplierMutationSchema,
  mutateSupplier,
} from "@/server/services/suppliers";
import { actionError, type ActionResult } from "@/lib/action-result";
export async function saveEquipmentReferenceAction(
  kind: "categories" | "suppliers",
  input: unknown,
): Promise<ActionResult> {
  try {
    const data =
      kind === "categories"
        ? categoryMutationSchema.parse(input)
        : supplierMutationSchema.parse(input);
    const { user, session } = await requireUser({
      headers: await headers(),
      permission: {
        action:
          data.operation === "delete"
            ? "archive"
            : data.id
              ? "update"
              : "create",
        resource: kind,
      },
    });
    const actor = { userId: user.id, sessionId: session.id };
    if (kind === "categories") await mutateCategory(getDb(), actor, data);
    else await mutateSupplier(getDb(), actor, data);
    revalidatePath("/references", "layout");
    revalidatePath("/equipment", "layout");
    return {
      success:
        data.operation === "delete"
          ? "Élément inutilisé supprimé."
          : "Référentiel enregistré.",
    };
  } catch (error) {
    return actionError(error);
  }
}
