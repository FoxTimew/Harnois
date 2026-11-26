import { requirePageUser } from "@/server/auth/require-page-user";
import { MfaService } from "@/server/services/mfa";
import { AdminReset } from "@/components/mfa/admin-reset";
export default async function AdminMfaPage() {
  const context = await requirePageUser("/admin/mfa", { roles: ["ADMIN"] });
  const status = await new MfaService().status({
    userId: context.user.id,
    sessionId: context.session.id,
  });
  return (
    <section className="max-w-2xl space-y-6">
      <p className="text-xs tracking-widest text-accent-foreground">
        ADMINISTRATION
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">
        Réinitialisation de la 2FA
      </h1>
      <p className="text-sm leading-6 text-muted-foreground">
        Réservé à la récupération d’un autre utilisateur après vérification de
        son identité. Il devra configurer un nouveau facteur lors de sa
        prochaine connexion si la 2FA lui est imposée.
      </p>
      <AdminReset initial={status} />
    </section>
  );
}
