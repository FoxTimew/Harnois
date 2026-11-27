import Link from "next/link";
import { requirePageUser } from "@/server/auth/require-page-user";
import { getDb } from "@/server/db";
import { listUsers } from "@/server/services/users";
import { UserTable } from "@/components/users/user-table";
import { PageHeading } from "@/components/layout/page-heading";
import { buttonVariants } from "@/components/ui/button";
import type { SearchParams } from "@/lib/table-query";
import { departedActiveAccounts } from "@/server/services/employees";
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user, session } = await requirePageUser("/admin/users", {
    permission: { action: "read", resource: "users" },
  });
  const result = await listUsers(
    getDb(),
    { userId: user.id, sessionId: session.id },
    await searchParams,
  );
  const departed = await departedActiveAccounts(getDb(), {
    userId: user.id,
    sessionId: session.id,
  });
  return (
    <section>
      <PageHeading
        eyebrow="ADMINISTRATION"
        title="Utilisateurs"
        description="Les personnes qui accèdent à Harnois, leurs rôles et la sécurité de leurs comptes."
      >
        <Link href="/admin/invitations" className={buttonVariants()}>
          Inviter une personne
        </Link>
      </PageHeading>
      {departed.count > 0 && (
        <section
          role="status"
          aria-label="Comptes à désactiver"
          className="mb-6 rounded-2xl border border-warning/40 bg-warning/10 p-6"
        >
          <h2 className="font-semibold">
            {departed.count} compte(s) actif(s) lié(s) à des employés partis
          </h2>
          <p className="mt-2 text-sm">
            Vérifiez les accès et désactivez chaque compte depuis sa fiche
            utilisateur, après vérification récente.
          </p>
          <ul className="mt-4 space-y-2">
            {departed.rows.map((row) => (
              <li key={row.id}>
                <Link
                  className="text-sm font-medium underline"
                  href={"/admin/users/" + row.id}
                >
                  {row.employee?.firstName} {row.employee?.lastName} — vérifier
                  le compte
                </Link>
              </li>
            ))}
          </ul>
          {departed.count > departed.rows.length && (
            <p className="mt-3 text-sm">
              Les 50 premiers comptes sont affichés ; les suivants apparaîtront
              après traitement.
            </p>
          )}
        </section>
      )}
      <UserTable result={result} />
    </section>
  );
}
