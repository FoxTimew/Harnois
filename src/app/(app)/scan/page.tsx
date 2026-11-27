import { requirePageUser } from "@/server/auth/require-page-user";
import { getServerEnv } from "@/server/env";
import { PageHeading } from "@/components/layout/page-heading";
import { EquipmentScanner } from "@/components/equipment/scanner";
export default async function ScanPage() {
  await requirePageUser("/scan", {
    permission: { action: "equipment:scan", resource: "equipment" },
  });
  return (
    <section>
      <PageHeading
        eyebrow="PARC / SCAN"
        title="Scanner un équipement"
        description="Ouvrez une fiche depuis son étiquette QR."
      />
      <EquipmentScanner
        origin={new URL(getServerEnv().BETTER_AUTH_URL).origin}
      />
    </section>
  );
}
