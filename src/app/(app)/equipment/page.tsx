import Link from "next/link";
import { requirePageUser } from "@/server/auth/require-page-user";
import { getDb } from "@/server/db";
import { listEquipment, equipmentOptions } from "@/server/services/equipment";
import { EquipmentTable } from "@/components/equipment/equipment-table";
import { PageHeading } from "@/components/layout/page-heading";
import { buttonVariants } from "@/components/ui/button";
import type { SearchParams } from "@/lib/table-query";
export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user, session } = await requirePageUser("/equipment", {
      permission: { action: "read", resource: "equipment" },
    }),
    actor = { userId: user.id, sessionId: session.id };
  const [result, options] = await Promise.all([
    listEquipment(getDb(), actor, await searchParams),
    equipmentOptions(getDb(), actor),
  ]);
  const financial = user.role === "ADMIN" || user.role === "IT_MANAGER";
  return (
    <section>
      <PageHeading
        eyebrow="PARC INFORMATIQUE"
        title="Équipements"
        description="Le matériel, ses détenteurs et chaque étape de son cycle de vie."
      >
        <Link className={buttonVariants({ variant: "outline" })} href="/scan">
          Scanner un QR
        </Link>
        {financial && (
          <Link
            className={buttonVariants({ variant: "outline" })}
            href="/equipment/import"
          >
            Importer un CSV
          </Link>
        )}
        <Link className={buttonVariants()} href="/equipment/new">
          Ajouter un équipement
        </Link>
      </PageHeading>
      <EquipmentTable result={result} options={options} canExport={financial} />
    </section>
  );
}
