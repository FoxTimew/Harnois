import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { MfaFlow } from "@/components/mfa/mfa-flow";
import { safeReturnUrl } from "@/lib/return-url";
import { requirePageUser } from "@/server/auth/require-page-user";
import { MfaService } from "@/server/services/mfa";
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const returnTo = safeReturnUrl((await searchParams).returnTo);
  const context = await requirePageUser(returnTo, {
    states: ["setup", "ready"],
  });
  if (context.mfa.hasFactor) redirect(returnTo);
  const status = await new MfaService().status({
    userId: context.user.id,
    sessionId: context.session.id,
  });
  return (
    <AuthShell
      title="Protégez votre compte."
      description="Configurez un second facteur pour sécuriser votre accès à Harnois, quelle que soit votre méthode de connexion."
    >
      <MfaFlow initial={status} mode="setup" returnTo={returnTo} />
    </AuthShell>
  );
}
