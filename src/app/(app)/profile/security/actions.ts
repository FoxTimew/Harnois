"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { sessionMutationSchema } from "@/lib/admin-validation";
import { actionError, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/server/auth/require-user";
import { getDb } from "@/server/db";
import { revokeSessions } from "@/server/services/sessions";
export async function revokeSessionAction(
  input: unknown,
): Promise<ActionResult & { currentRevoked?: boolean }> {
  try {
    const data = sessionMutationSchema.parse(input);
    const { user, session } = await requireUser({
      headers: await headers(),
      fresh: true,
    });
    const result = await revokeSessions(
      getDb(),
      { userId: user.id, sessionId: session.id },
      data,
    );
    revalidatePath("/profile/security");
    return { ...result, success: "Session révoquée." };
  } catch (error) {
    return actionError(error);
  }
}
