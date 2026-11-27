import { requirePageUser } from "@/server/auth/require-page-user";
import { getDb } from "@/server/db";
import { equipmentOptions } from "@/server/services/equipment";
import { equipmentFieldsSchema } from "@/lib/equipment-validation";
import { EquipmentEditor } from "@/components/equipment/equipment-editor";
import { PageHeading } from "@/components/layout/page-heading";
export default async function NewEquipmentPage() {
  const { user, session } = await requirePageUser("/equipment/new", {
    permission: { action: "create", resource: "equipment" },
  });
  const options = await equipmentOptions(getDb(), {
    userId: user.id,
    sessionId: session.id,
  });
  const defaults = {
    ...equipmentFieldsSchema.parse({
      name: "Équipement",
      categoryId: options.categories[0]?.id ?? "none",
    }),
    name: "",
    categoryId: options.categories[0]?.id ?? "",
  };
  return (
    <section className="max-w-4xl">
      <PageHeading
        eyebrow="PARC / ÉQUIPEMENTS"
        title="Ajouter un équipement"
        description="Le numéro d’inventaire sera attribué automatiquement si vous le laissez vide."
      />
      <EquipmentEditor
        initialFields={defaults}
        options={options}
        financial={user.role !== "TECHNICIAN"}
      />
    </section>
  );
}
