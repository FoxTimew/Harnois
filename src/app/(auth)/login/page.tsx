import { guardIncompletePage } from "@/server/auth/require-page-user";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { providerAvailability } from "@/server/auth/providers";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; registered?: string }>;
}) {
  await guardIncompletePage();
  const query = await searchParams;
  return (
    <AuthShell
      title="Heureux de vous retrouver."
      description="Connectez-vous avec la méthode associée à votre compte."
    >
      <LoginForm
        providers={providerAvailability()}
        error={query.error}
        registered={query.registered === "1"}
      />
    </AuthShell>
  );
}
