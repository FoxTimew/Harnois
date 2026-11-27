import { notFound } from "next/navigation";
import { requirePageUser } from "@/server/auth/require-page-user";
import { getDb } from "@/server/db";
import { equipmentOptions, equipmentDetail } from "@/server/services/equipment";
import { equipmentFieldsSchema } from "@/lib/equipment-validation";
import { EquipmentEditor } from "@/components/equipment/equipment-editor";
import { PageHeading } from "@/components/layout/page-heading";
import { ServiceError } from "@/server/services/errors";
export default async function EditEquipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    { user, session } = await requirePageUser("/equipment/" + id + "/edit", {
      permission: { action: "update", resource: "equipment" },
    });
  const actor = { userId: user.id, sessionId: session.id };
  let row;
  try {
    row = await equipmentDetail(getDb(), actor, id);
  } catch (e) {
    if (e instanceof ServiceError && e.status === 404) notFound();
    throw e;
  }
  const options = await equipmentOptions(getDb(), actor),
    fields = equipmentFieldsSchema.parse(
      Object.fromEntries(
        Object.keys(equipmentFieldsSchema.shape).map((key) => [
          key,
          row[key as keyof typeof row],
        ]),
      ),
    );
  return (
    <section className="max-w-4xl">
      <PageHeading
        eyebrow={"PARC / " + row.assetTag}
        title="Modifier l’équipement"
        description="Les changements de statut sont conservés dans le journal."
      />
      <EquipmentEditor
        key={row.updatedAt}
        id={id}
        updatedAt={row.updatedAt}
        initialFields={fields}
        options={options}
        financial={user.role !== "TECHNICIAN"}
      />
    </section>
  );
}
