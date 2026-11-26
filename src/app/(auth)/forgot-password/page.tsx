import { guardIncompletePage } from "@/server/auth/require-page-user";
import { AuthShell } from "@/components/auth/auth-shell";
import { RecoveryForm } from "@/components/auth/recovery-form";
export default async function ForgotPasswordPage() {
  await guardIncompletePage();
  return (
    <AuthShell
      title="Un nouveau départ."
      description="Recevez un lien pour choisir un nouveau mot de passe. Il sera valable une heure."
    >
      <RecoveryForm />
    </AuthShell>
  );
}
