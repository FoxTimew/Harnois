import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/server/auth/require-page-user";
import { getDb } from "@/server/db";
import { auditDetail } from "@/server/services/audit";
import { ServiceError } from "@/server/services/errors";
import { AuditChanges } from "@/components/audit/audit-changes";
import { PageHeading } from "@/components/layout/page-heading";
import { formatDate } from "@/lib/format";
import { auditActionLabel, auditEntityLabel } from "@/lib/audit-labels";
export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, session } = await requirePageUser("/admin/audit", {
    permission: {
      action: "read",
      resource: { type: "audit", category: "business" },
    },
  });
  let row;
  try {
    row = await auditDetail(
      getDb(),
      { userId: user.id, sessionId: session.id },
      (await params).id,
    );
  } catch (error) {
    if (error instanceof ServiceError && error.status === 404) notFound();
    throw error;
  }
  return (
    <section className="max-w-3xl">
      <Link
        href="/admin/audit"
        className="mb-5 inline-block text-sm text-muted-foreground hover:underline"
      >
        ← Journal d’audit
      </Link>
      <PageHeading
        eyebrow="DÉTAIL DE L’ÉVÉNEMENT"
        title="Historique du changement"
        description={
          formatDate(row.createdAt) + " · " + (row.user?.name ?? "Système")
        }
      />
      <div className="rounded-2xl border bg-card p-6">
        <dl className="mb-8 grid gap-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Action</dt>
            <dd className="mt-2 break-all" title={row.action}>
              {auditActionLabel(row.action)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Entité</dt>
            <dd className="mt-2 break-all">
              {auditEntityLabel(row.entityType)} · {row.entityId}
            </dd>
          </div>
        </dl>
        <h2 className="mb-4 text-xl font-semibold">Changements</h2>
        <AuditChanges value={row.changes} />
      </div>
    </section>
  );
}
