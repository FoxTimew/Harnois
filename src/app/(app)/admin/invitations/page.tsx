import { requirePageUser } from "@/server/auth/require-page-user";
import { getDb } from "@/server/db";
import { invitationOverview } from "@/server/services/invitations";
import { AdminInvitations } from "@/components/auth/admin-invitations";
export default async function InvitationsPage() {
  const context = await requirePageUser("/admin/invitations", {
    roles: ["ADMIN"],
  });
  const overview = await invitationOverview(getDb(), context.user.id);
  return (
    <section>
      <p className="text-xs tracking-widest text-accent-foreground">
        ADMINISTRATION
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        Invitations
      </h1>
      <p className="mt-4 mb-8 text-sm text-muted-foreground">
        Ouvrez l’accès à votre équipe, une personne à la fois.
      </p>
      <AdminInvitations {...overview} />
    </section>
  );
}
