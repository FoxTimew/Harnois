import Link from "next/link";
import { requirePageUser } from "@/server/auth/require-page-user";
import { roleLabels } from "@/lib/auth-messages";
import { formatDate } from "@/lib/format";
import { PageHeading } from "@/components/layout/page-heading";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
export default async function ProfilePage() {
  const { user } = await requirePageUser("/profile");
  return (
    <section className="max-w-3xl">
      <PageHeading
        eyebrow="VOTRE ESPACE"
        title="Mon profil"
        description="Vos informations et votre accès à Harnois."
      />
      <div className="rounded-2xl border bg-card p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold">{user.name}</h2>
          <StatusBadge tone="positive">Compte actif</StatusBadge>
        </div>
        <dl className="mt-8 grid gap-6 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Adresse email</dt>
            <dd className="mt-2 break-all">{user.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Rôle</dt>
            <dd className="mt-2">{roleLabels[user.role]}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              Dernière connexion
            </dt>
            <dd className="mt-2">{formatDate(user.lastLoginAt)}</dd>
          </div>
        </dl>
        <div className="mt-8 border-t pt-6">
          <Link
            href="/profile/security"
            className={buttonVariants({ variant: "outline" })}
          >
            Gérer la sécurité de mon compte
          </Link>
        </div>
      </div>
    </section>
  );
}
