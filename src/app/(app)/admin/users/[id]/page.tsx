import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/server/auth/require-page-user";
import { getDb } from "@/server/db";
import { userDetail } from "@/server/services/users";
import { listSessions } from "@/server/services/sessions";
import { MfaService } from "@/server/services/mfa";
import { ServiceError } from "@/server/services/errors";
import { PageHeading } from "@/components/layout/page-heading";
import { UserEditor } from "@/components/users/user-editor";
import { SessionList } from "@/components/sessions/session-list";
import { AdminReset } from "@/components/mfa/admin-reset";
import { StatusBadge } from "@/components/ui/status-badge";
export default async function UserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, session } = await requirePageUser("/admin/users", {
    permission: { action: "read", resource: "users" },
  });
  const { id } = await params;
  const actor = { userId: user.id, sessionId: session.id };
  let target;
  try {
    target = await userDetail(getDb(), actor, id);
  } catch (error) {
    if (error instanceof ServiceError && error.status === 404) notFound();
    throw error;
  }
  const [sessions, status] = await Promise.all([
    listSessions(getDb(), actor, id),
    new MfaService().status(actor),
  ]);
  return (
    <section className="max-w-5xl">
      <Link
        href="/admin/users"
        className="mb-5 inline-block text-sm text-muted-foreground hover:underline"
      >
        ← Tous les utilisateurs
      </Link>
      <PageHeading
        eyebrow="ADMINISTRATION / UTILISATEURS"
        title={target.name}
        description={target.email}
      >
        <StatusBadge tone={target.isActive ? "positive" : "neutral"}>
          {target.isActive ? "Compte actif" : "Compte désactivé"}
        </StatusBadge>
      </PageHeading>
      <div className="space-y-6">
        <UserEditor
          key={target.id + target.role + target.isActive + target.employeeId}
          target={target}
          own={id === user.id}
          initial={status}
        />
        <SessionList sessions={sessions} readOnly />
        {id !== user.id && (
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="mb-5 text-xl font-semibold">
              Réinitialiser la double authentification
            </h2>
            <AdminReset initial={status} targetEmail={target.email} />
          </section>
        )}
      </div>
    </section>
  );
}
