import { requirePageUser } from "@/server/auth/require-page-user";
import { PageHeading } from "@/components/layout/page-heading";
import { EquipmentImport } from "@/components/equipment/equipment-import";
export default async function EquipmentImportPage() {
  await requirePageUser("/equipment/import", {
    permission: { action: "equipment:import", resource: "equipment" },
  });
  return (
    <section>
      <PageHeading
        eyebrow="PARC / ÉQUIPEMENTS"
        title="Importer des équipements"
        description="Analysez le fichier, vérifiez les lignes et confirmez l’import."
      />
      <EquipmentImport />
    </section>
  );
}
