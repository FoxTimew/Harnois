import { requirePageUser } from "@/server/auth/require-page-user";
import { getDb } from "@/server/db";
import { listSuppliers } from "@/server/services/suppliers";
import { PageHeading } from "@/components/layout/page-heading";
import { ReferenceTabs } from "@/components/references/reference-tabs";
import { EquipmentReferenceManager } from "@/components/references/equipment-reference-manager";
export default async function ReferencePage() {
  const { user, session } = await requirePageUser("/references/suppliers", {
    permission: { action: "read", resource: "suppliers" },
  });
  const rows = await listSuppliers(getDb(), {
    userId: user.id,
    sessionId: session.id,
  });
  return (
    <section>
      <PageHeading
        eyebrow="STRUCTURE"
        title="Référentiels"
        description="Les partenaires qui fournissent votre matériel et vos logiciels."
      />
      <ReferenceTabs current="suppliers" />
      <EquipmentReferenceManager
        kind="suppliers"
        rows={rows}
        editable={user.role === "ADMIN" || user.role === "IT_MANAGER"}
      />
    </section>
  );
}
