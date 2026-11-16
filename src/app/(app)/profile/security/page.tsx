import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/require-user";
import { providerAvailability } from "@/server/auth/providers";
import { getDb } from "@/server/db";
import { listAccounts } from "@/server/services/accounts";
import { SecurityMethods } from "@/components/auth/security-methods";
export default async function SecurityPage() {
  const context = await requireUser({ headers: await headers() }).catch(
    () => null,
  );
  if (!context) redirect("/login");
  const accounts = await listAccounts(getDb(), context.user.id);
  return (
    <section className="max-w-2xl">
      <p className="text-xs font-medium tracking-widest text-accent-foreground">
        MON COMPTE / SÉCURITÉ
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        Méthodes de connexion
      </h1>
      <p className="mt-4 mb-8 text-sm leading-6 text-muted-foreground">
        Gérez les accès à votre espace Harnois.
      </p>
      <SecurityMethods accounts={accounts} providers={providerAvailability()} />
    </section>
  );
}
