import { requirePageUser } from "@/server/auth/require-page-user";
import { MfaService } from "@/server/services/mfa";
import { PageHeading } from "@/components/layout/page-heading";
import { EmployeeImport } from "@/components/employees/employee-import";
export default async function ImportPage() {
  const { user, session } = await requirePageUser("/employees/import", {
    permission: { action: "employees:import", resource: "employees" },
  });
  const initialMfa = await new MfaService().status({
    userId: user.id,
    sessionId: session.id,
  });
  return (
    <section>
      <PageHeading
        eyebrow="ÉQUIPE / EMPLOYÉS"
        title="Importer des employés"
        description="Vérifiez chaque ligne avant d’intégrer votre fichier."
      />
      <EmployeeImport admin={user.role === "ADMIN"} initialMfa={initialMfa} />
    </section>
  );
}
