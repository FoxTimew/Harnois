import { AuthShell } from "@/components/auth/auth-shell";
import { RecoveryForm } from "@/components/auth/recovery-form";
export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Un nouveau départ."
      description="Recevez un lien pour choisir un nouveau mot de passe. Il sera valable une heure."
    >
      <RecoveryForm />
    </AuthShell>
  );
}
