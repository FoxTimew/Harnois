import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeReturnUrl } from "@/lib/return-url";
import { ServiceError } from "@/server/services/errors";
import { requireUser } from "./require-user";
import type { MfaAccess } from "./mfa-policy";
import type { Permission } from "./permissions";
export async function requirePageUser(
  returnTo?: string,
  access: MfaAccess & { permission?: Permission } = {},
) {
  const requestHeaders = await headers();
  const next = safeReturnUrl(returnTo ?? requestHeaders.get("x-harnois-path"));
  try {
    return await requireUser({ headers: requestHeaders, ...access });
  } catch (error) {
    if (error instanceof ServiceError) {
      if (error.code === "MFA_SETUP_REQUIRED")
        redirect(`/mfa/setup?returnTo=${encodeURIComponent(next)}`);
      if (error.code === "MFA_REQUIRED")
        redirect(`/mfa/verify?returnTo=${encodeURIComponent(next)}`);
      if (error.code === "FORBIDDEN") redirect("/forbidden");
      if (error.code === "UNAUTHENTICATED") redirect("/login");
    }
    throw error;
  }
}

/** Public pages do not provide an alternate path for an incomplete session. */
export async function guardIncompletePage() {
  const requestHeaders = await headers();
  let context;
  try {
    context = await requireUser({
      headers: requestHeaders,
      states: ["setup", "verify", "ready"],
    });
  } catch (error) {
    if (error instanceof ServiceError && error.code === "UNAUTHENTICATED")
      return;
    throw error;
  }
  if (context.mfa.state === "setup") redirect("/mfa/setup");
  if (context.mfa.state === "verify") redirect("/mfa/verify");
}
