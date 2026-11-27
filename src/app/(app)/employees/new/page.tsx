import { requirePageUser } from "@/server/auth/require-page-user";
import { getDb } from "@/server/db";
import { employeeOptions } from "@/server/services/employees";
import { MfaService } from "@/server/services/mfa";
import { PageHeading } from "@/components/layout/page-heading";
import { EmployeeEditor } from "@/components/employees/employee-editor";
export default async function NewEmployeePage() {
  const { user, session } = await requirePageUser("/employees/new", {
    permission: { action: "create", resource: "employees" },
  });
  const actor = { userId: user.id, sessionId: session.id };
  const [options, initialMfa] = await Promise.all([
    employeeOptions(getDb(), actor),
    new MfaService().status(actor),
  ]);
  return (
    <section className="max-w-4xl">
      <PageHeading
        eyebrow="ÉQUIPE / EMPLOYÉS"
        title="Ajouter un employé"
        description="Une fiche professionnelle, indépendante du compte de connexion."
      />
      <EmployeeEditor
        options={options}
        admin={user.role === "ADMIN"}
        activeAccount={false}
        initialMfa={initialMfa}
        initialFields={{
          firstName: "",
          lastName: "",
          email: "",
          phone: null,
          jobTitle: null,
          status: "ONBOARDING",
          startDate: null,
          endDate: null,
          organizationId: null,
          departmentId: null,
          locationId: null,
          managerId: null,
        }}
      />
    </section>
  );
}
