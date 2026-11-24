import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { InvitationForm } from "@/components/auth/invitation-form";
import { FormMessage } from "@/components/auth/form-message";
import { getDb } from "@/server/db";
import { findInvitationByToken } from "@/server/services/invitations";
import { providerAvailability } from "@/server/auth/providers";
export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await findInvitationByToken(getDb(), token).catch(
    () => null,
  );
  return (
    <AuthShell
      title={
        invitation ? "Bienvenue dans l’équipe." : "Invitation indisponible."
      }
      description={
        invitation
          ? "Choisissez votre méthode de connexion pour activer votre accès."
          : "Ce lien a expiré, a été révoqué ou a déjà été utilisé."
      }
    >
      {invitation ? (
        <InvitationForm
          token={token}
          email={invitation.email}
          providers={providerAvailability()}
        />
      ) : (
        <div className="space-y-6">
          <FormMessage>
            Demandez une nouvelle invitation à votre administrateur.
          </FormMessage>
          <Link href="/login" className="text-sm underline">
            Revenir à la connexion
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
