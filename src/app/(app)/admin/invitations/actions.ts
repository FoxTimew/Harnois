"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { invitationSchema } from "@/lib/validation";
import { requireUser } from "@/server/auth/require-user";
import { consumeRateLimit, privateRateKey } from "@/server/auth/rate-limit";
import { getDb } from "@/server/db";
import { getServerEnv } from "@/server/env";
import { assertMailConfigured, sendEmail } from "@/server/mail";
import {
  createInvitation,
  revokeInvitation,
} from "@/server/services/invitations";
import { ServiceError } from "@/server/services/errors";
function errorResult(error: unknown) {
  return {
    error: error instanceof ServiceError ? error.code : "INVALID_REQUEST",
  };
}
export async function inviteAction(
  input: unknown,
): Promise<{ error?: string }> {
  try {
    const data = invitationSchema.parse(input);
    const { user, session } = await requireUser({
      headers: await headers(),
      permission: {
        action: "create",
        resource: { type: "invitations", invitationRole: data.role },
      },
    });
    const db = getDb();
    if (
      !(await consumeRateLimit(
        db,
        privateRateKey("admin-invitations", user.id),
        10,
        60,
      ))
    )
      throw new ServiceError("RATE_LIMITED");
    const env = getServerEnv();
    assertMailConfigured(env);
    const { invitation, token } = await createInvitation(
      db,
      user.id,
      data,
      session.id,
    );
    revalidatePath("/admin/invitations");
    await sendEmail({
      to: invitation.email,
      template: "invitation",
      url: `${env.BETTER_AUTH_URL}/invitation/${token}`,
    });
    return {};
  } catch (error) {
    return errorResult(error);
  }
}
export async function revokeAction(
  input: unknown,
): Promise<{ error?: string }> {
  try {
    const id = z.string().min(1).max(128).parse(input);
    const { user, session } = await requireUser({
      headers: await headers(),
      permission: {
        action: "archive",
        resource: { type: "invitations", invitationRole: "EMPLOYEE" },
      },
    });
    await revokeInvitation(getDb(), user.id, id, session.id);
    revalidatePath("/admin/invitations");
    return {};
  } catch (error) {
    return errorResult(error);
  }
}
