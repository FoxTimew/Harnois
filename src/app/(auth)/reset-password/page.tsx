import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/recovery-form";
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return (
    <AuthShell
      title="Votre nouveau mot de passe."
      description="Choisissez un mot de passe unique, de 12 à 128 caractères."
    >
      {token && !error ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="text-sm leading-7">
          Ce lien n’est pas utilisable.{" "}
          <Link href="/forgot-password" className="underline">
            Demandez un nouveau lien.
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
