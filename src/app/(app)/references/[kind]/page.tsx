import { ReferenceTabs } from "@/components/references/reference-tabs";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/server/auth/require-page-user";
import { getDb } from "@/server/db";
import { referenceKindSchema } from "@/lib/reference-validation";
import { listReferences } from "@/server/services/references";
import { PageHeading } from "@/components/layout/page-heading";
import { ReferenceManager } from "@/components/references/reference-manager";
export default async function ReferencesPage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const parsed = referenceKindSchema.safeParse((await params).kind);
  if (!parsed.success) notFound();
  const kind = parsed.data;
  const { user, session } = await requirePageUser("/references/" + kind, {
    permission: { action: "read", resource: "organizations" },
  });
  const actor = { userId: user.id, sessionId: session.id };
  const [rows, organizations] = await Promise.all([
    listReferences(getDb(), actor, kind),
    kind === "departments"
      ? listReferences(getDb(), actor, "organizations")
      : Promise.resolve([]),
  ]);
  return (
    <section>
      <PageHeading
        eyebrow="STRUCTURE"
        title="Référentiels"
        description="Les organisations, leurs pôles et les lieux de travail de votre équipe."
      />
      <ReferenceTabs current={kind} />
      <ReferenceManager
        kind={kind}
        rows={rows}
        organizations={organizations}
        editable={user.role === "ADMIN" || user.role === "IT_MANAGER"}
      />
    </section>
  );
}
