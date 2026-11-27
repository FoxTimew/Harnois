"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { userMutationSchema } from "@/lib/admin-validation";
import { actionError, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/server/auth/require-user";
import { getDb } from "@/server/db";
import { mutateUser } from "@/server/services/users";
export async function updateUserAction(input: unknown): Promise<ActionResult> {
  try {
    const data = userMutationSchema.parse(input);
    const { user, session } = await requireUser({
      headers: await headers(),
      fresh: true,
      permission: { action: "update", resource: "users" },
    });
    await mutateUser(getDb(), { userId: user.id, sessionId: session.id }, data);
    revalidatePath("/admin/users");
    revalidatePath("/employees", "layout");
    revalidatePath(`/admin/users/${data.userId}`);
    return { success: "Modification enregistrée." };
  } catch (error) {
    return actionError(error);
  }
}
