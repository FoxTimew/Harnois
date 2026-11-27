"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/require-user";
import { getDb } from "@/server/db";
import { equipmentMutationSchema } from "@/lib/equipment-validation";
import {
  assignmentSchema,
  returnSchema,
  loanDateSchema,
} from "@/lib/assignment-validation";
import { mutateEquipment } from "@/server/services/equipment";
import {
  assignEquipment,
  closeAssignment,
  changeLoanDate,
} from "@/server/services/equipment-assignments";
import { actionError, type ActionResult } from "@/lib/action-result";
export async function saveEquipmentAction(
  input: unknown,
): Promise<ActionResult & { id?: string }> {
  try {
    const data = equipmentMutationSchema.parse(input);
    const { user, session } = await requireUser({
      headers: await headers(),
      permission: {
        action: data.id ? "update" : "create",
        resource: "equipment",
      },
    });
    const result = await mutateEquipment(
      getDb(),
      { userId: user.id, sessionId: session.id },
      data,
    );
    revalidatePath("/equipment", "layout");
    return { id: result.id, success: "Équipement enregistré." };
  } catch (error) {
    return actionError(error);
  }
}
export async function assignmentAction(
  operation: "assign" | "return" | "loan-date",
  input: unknown,
): Promise<ActionResult> {
  try {
    const data =
      operation === "assign"
        ? assignmentSchema.parse(input)
        : operation === "return"
          ? returnSchema.parse(input)
          : loanDateSchema.parse(input);
    const { user, session } = await requireUser({
      headers: await headers(),
      permission: {
        action: operation === "assign" ? "create" : "update",
        resource: "assignments",
      },
    });
    const actor = { userId: user.id, sessionId: session.id },
      db = getDb();
    if (operation === "assign") await assignEquipment(db, actor, data);
    else if (operation === "return") await closeAssignment(db, actor, data);
    else await changeLoanDate(db, actor, data);
    revalidatePath("/equipment", "layout");
    revalidatePath("/employees", "layout");
    revalidatePath("/my-equipment");
    return { success: "Mouvement enregistré." };
  } catch (error) {
    return actionError(error);
  }
}
