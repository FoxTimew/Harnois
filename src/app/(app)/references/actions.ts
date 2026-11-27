"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/require-user";
import { getDb } from "@/server/db";
import { referenceMutationSchema } from "@/lib/reference-validation";
import { mutateReference } from "@/server/services/references";
import { actionError, type ActionResult } from "@/lib/action-result";
export async function saveReferenceAction(
  input: unknown,
): Promise<ActionResult> {
  try {
    const data = referenceMutationSchema.parse(input);
    const { user, session } = await requireUser({
      headers: await headers(),
      permission: {
        action:
          data.operation === "delete"
            ? "archive"
            : data.id
              ? "update"
              : "create",
        resource: "organizations",
      },
    });
    await mutateReference(
      getDb(),
      { userId: user.id, sessionId: session.id },
      data,
    );
    revalidatePath("/references", "layout");
    revalidatePath("/employees", "layout");
    return {
      success:
        data.operation === "delete"
          ? "Référentiel inutilisé supprimé."
          : "Référentiel enregistré.",
    };
  } catch (error) {
    return actionError(error);
  }
}
