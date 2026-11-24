import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/require-user";
import { getDb } from "@/server/db";
import { invitationOverview } from "@/server/services/invitations";
import { AdminInvitations } from "@/components/auth/admin-invitations";
import { ServiceError } from "@/server/services/errors";
export default async function InvitationsPage() {
  const context = await requireUser({
    headers: await headers(),
    roles: ["ADMIN"],
  }).catch((error: unknown) => {
    if (error instanceof ServiceError && error.code === "FORBIDDEN")
      return null;
    redirect("/login");
  });
  if (!context)
    return (
      <section>
        <h1 className="text-3xl font-semibold">Accès non autorisé</h1>
        <p className="mt-4 text-sm">
          Cette page est réservée aux administrateurs.
        </p>
      </section>
    );
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
