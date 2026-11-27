import { requirePageUser } from "@/server/auth/require-page-user";
import { getDb } from "@/server/db";
import { listAudit } from "@/server/services/audit";
import { AuditTable } from "@/components/audit/audit-table";
import { PageHeading } from "@/components/layout/page-heading";
import type { SearchParams } from "@/lib/table-query";
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user, session } = await requirePageUser("/admin/audit", {
    permission: {
      action: "read",
      resource: { type: "audit", category: "business" },
    },
  });
  const result = await listAudit(
    getDb(),
    { userId: user.id, sessionId: session.id },
    await searchParams,
  );
  return (
    <section>
      <PageHeading
        eyebrow="ADMINISTRATION"
        title="Journal d’audit"
        description="Consultez les événements et retrouvez l’historique des changements."
      />
      <AuditTable result={result} businessOnly={user.role !== "ADMIN"} />
    </section>
  );
}
