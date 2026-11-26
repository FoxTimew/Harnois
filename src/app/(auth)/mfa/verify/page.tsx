import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { MfaFlow } from "@/components/mfa/mfa-flow";
import { safeReturnUrl } from "@/lib/return-url";
import { requirePageUser } from "@/server/auth/require-page-user";
import { MfaService } from "@/server/services/mfa";
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const returnTo = safeReturnUrl((await searchParams).returnTo);
  const context = await requirePageUser(returnTo, {
    states: ["verify", "ready"],
  });
  if (!context.mfa.hasFactor) redirect(returnTo);
  const status = await new MfaService().status({
    userId: context.user.id,
    sessionId: context.session.id,
  });
  return (
    <AuthShell
      title="Vérifiez votre identité."
      description="Une dernière vérification avant d’accéder à votre espace. Utilisez l’un de vos facteurs enregistrés."
    >
      <MfaFlow initial={status} mode="verify" returnTo={returnTo} />
    </AuthShell>
  );
}
