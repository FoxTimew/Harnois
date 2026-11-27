import { notFound } from "next/navigation";
import { requirePageUser } from "@/server/auth/require-page-user";
import { getDb } from "@/server/db";
import { employeeOptions, employeeDetail } from "@/server/services/employees";
import { ServiceError } from "@/server/services/errors";
import { MfaService } from "@/server/services/mfa";
import { PageHeading } from "@/components/layout/page-heading";
import { EmployeeEditor } from "@/components/employees/employee-editor";
export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, session } = await requirePageUser(
    "/employees/" + id + "/edit",
    { permission: { action: "update", resource: "employees" } },
  );
  const actor = { userId: user.id, sessionId: session.id };
  let row;
  try {
    row = await employeeDetail(getDb(), actor, id);
  } catch (error) {
    if (error instanceof ServiceError && error.status === 404) notFound();
    throw error;
  }
  const [options, initialMfa] = await Promise.all([
    employeeOptions(getDb(), actor),
    new MfaService().status(actor),
  ]);
  return (
    <section className="max-w-4xl">
      <PageHeading
        eyebrow="ÉQUIPE / EMPLOYÉS"
        title={row.firstName + " " + row.lastName}
        description="Mettre à jour les informations et le parcours de l’employé."
      />
      <EmployeeEditor
        key={row.updatedAt}
        id={id}
        updatedAt={row.updatedAt}
        options={options}
        admin={user.role === "ADMIN"}
        activeAccount={Boolean(row.user?.isActive)}
        initialMfa={initialMfa}
        initialFields={{
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          phone: row.phone ?? null,
          jobTitle: row.jobTitle,
          status: row.status,
          startDate: row.startDate ?? null,
          endDate: row.endDate ?? null,
          organizationId: row.organizationId,
          departmentId: row.departmentId,
          locationId: row.locationId,
          managerId: row.managerId,
        }}
      />
    </section>
  );
}
