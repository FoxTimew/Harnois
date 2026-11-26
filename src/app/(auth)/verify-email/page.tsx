import { guardIncompletePage } from "@/server/auth/require-page-user";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { RecoveryForm } from "@/components/auth/recovery-form";
import { FormMessage } from "@/components/auth/form-message";
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string; error?: string }>;
}) {
  await guardIncompletePage();
  const query = await searchParams;
  return (
    <AuthShell
      title="Confirmez votre adresse."
      description="La vérification de votre email protège l’accès à votre compte."
    >
      {query.verified === "1" && !query.error ? (
        <div className="space-y-6">
          <FormMessage success>
            Votre adresse a été vérifiée. Vous pouvez vous connecter.
          </FormMessage>
          <Link href="/login" className="underline">
            Se connecter
          </Link>
        </div>
      ) : (
        <>
          <FormMessage>
            {query.error
              ? "Ce lien n’est plus utilisable. Demandez-en un nouveau."
              : null}
          </FormMessage>
          <RecoveryForm verification />
        </>
      )}
    </AuthShell>
  );
}
