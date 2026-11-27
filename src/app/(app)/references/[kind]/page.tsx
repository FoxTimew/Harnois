import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/server/auth/require-page-user";
import { getDb } from "@/server/db";
import {
  referenceKindSchema,
  referenceLabels,
} from "@/lib/reference-validation";
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
      <nav aria-label="Référentiels" className="mb-8 flex flex-wrap gap-2">
        {Object.entries(referenceLabels).map(([key, label]) => (
          <Link
            key={key}
            href={"/references/" + key}
            aria-current={key === kind ? "page" : undefined}
            className={`rounded-xl px-4 py-3 text-sm ${key === kind ? "bg-primary text-primary-foreground" : "border bg-card hover:bg-accent"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <ReferenceManager
        kind={kind}
        rows={rows}
        organizations={organizations}
        editable={user.role === "ADMIN" || user.role === "IT_MANAGER"}
      />
    </section>
  );
}
