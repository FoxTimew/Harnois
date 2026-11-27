import { requirePageUser } from "@/server/auth/require-page-user";
import { getDb } from "@/server/db";
import { listCategories } from "@/server/services/categories";
import { PageHeading } from "@/components/layout/page-heading";
import { ReferenceTabs } from "@/components/references/reference-tabs";
import { EquipmentReferenceManager } from "@/components/references/equipment-reference-manager";
export default async function ReferencePage() {
  const { user, session } = await requirePageUser("/references/categories", {
    permission: { action: "read", resource: "categories" },
  });
  const rows = await listCategories(getDb(), {
    userId: user.id,
    sessionId: session.id,
  });
  return (
    <section>
      <PageHeading
        eyebrow="STRUCTURE"
        title="Référentiels"
        description="Catégories et caractéristiques du matériel."
      />
      <ReferenceTabs current="categories" />
      <EquipmentReferenceManager
        kind="categories"
        rows={rows}
        editable={user.role === "ADMIN" || user.role === "IT_MANAGER"}
      />
    </section>
  );
}
