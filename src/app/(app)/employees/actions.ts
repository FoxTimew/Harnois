"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/require-user";
import { getDb } from "@/server/db";
import { employeeMutationSchema } from "@/lib/employee-validation";
import { mutateEmployee } from "@/server/services/employees";
import { actionError, type ActionResult } from "@/lib/action-result";
export async function saveEmployeeAction(
  input: unknown,
): Promise<ActionResult & { id?: string }> {
  try {
    const data = employeeMutationSchema.parse(input);
    const { user, session } = await requireUser({
      headers: await headers(),
      permission: {
        action: data.id ? "update" : "create",
        resource: "employees",
      },
    });
    const result = await mutateEmployee(
      getDb(),
      { userId: user.id, sessionId: session.id },
      data,
    );
    revalidatePath("/employees", "layout");
    revalidatePath("/admin/users");
    return { success: "Fiche enregistrée.", id: result.id };
  } catch (error) {
    return actionError(error);
  }
}
