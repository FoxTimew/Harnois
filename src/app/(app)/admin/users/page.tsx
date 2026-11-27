import Link from "next/link";
import { requirePageUser } from "@/server/auth/require-page-user";
import { getDb } from "@/server/db";
import { listUsers } from "@/server/services/users";
import { UserTable } from "@/components/users/user-table";
import { PageHeading } from "@/components/layout/page-heading";
import { buttonVariants } from "@/components/ui/button";
import type { SearchParams } from "@/lib/table-query";
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
      <UserTable result={result} />
    </section>
  );
}
