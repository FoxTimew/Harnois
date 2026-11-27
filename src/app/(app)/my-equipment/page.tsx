import { requirePageUser } from "@/server/auth/require-page-user";
import { getDb } from "@/server/db";
import { employeeEquipment } from "@/server/services/equipment";
import { EmployeeEquipment } from "@/components/equipment/equipment-history";
import { PageHeading } from "@/components/layout/page-heading";
export default async function MyEquipmentPage() {
  const { user, session } = await requirePageUser("/my-equipment");
  const rows = user.employeeId
    ? await employeeEquipment(
        getDb(),
        { userId: user.id, sessionId: session.id },
        user.employeeId,
      )
    : [];
  return (
    <section className="max-w-5xl">
      <PageHeading
        eyebrow="MON ESPACE"
        title="Mon matériel"
        description="Les équipements qui vous sont confiés et l’historique de vos restitutions."
      />
      <EmployeeEquipment rows={rows} personal />
    </section>
  );
}
