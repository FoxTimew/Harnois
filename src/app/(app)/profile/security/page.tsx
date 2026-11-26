import { requirePageUser } from "@/server/auth/require-page-user";
import { providerAvailability } from "@/server/auth/providers";
import { getDb } from "@/server/db";
import { listAccounts } from "@/server/services/accounts";
import { SecurityMethods } from "@/components/auth/security-methods";
import { SecurityFactors } from "@/components/mfa/security-factors";
import { MfaService } from "@/server/services/mfa";
import { PasswordChange } from "@/components/mfa/password-change";
export default async function SecurityPage() {
  const context = await requirePageUser("/profile/security");
  const accounts = await listAccounts(getDb(), context.user.id);
  const status = await new MfaService().status({
    userId: context.user.id,
    sessionId: context.session.id,
  });
  return (
    <section className="max-w-2xl">
      <p className="text-xs font-medium tracking-widest text-accent-foreground">
        MON COMPTE / SÉCURITÉ
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        Sécurité
      </h1>
      <p className="mt-4 mb-8 text-sm leading-6 text-muted-foreground">
        Gérez les accès à votre espace Harnois.
      </p>
      <div className="space-y-12">
        <SecurityFactors initial={status} />
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold">Méthodes de connexion</h2>
          <SecurityMethods
            accounts={accounts}
            providers={providerAvailability()}
          />
        </section>
        {status.hasPassword && <PasswordChange />}
      </div>
    </section>
  );
}
