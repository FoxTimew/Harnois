import { employeeEquipment } from "@/server/services/equipment";
import Link from "next/link";
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
  const material = (await employeeEquipment(getDb(), actor, id)).filter(
    (r) => !r.returnedAt,
  );
  return (
    <section className="max-w-4xl">
      <PageHeading
        eyebrow="ÉQUIPE / EMPLOYÉS"
        title={row.firstName + " " + row.lastName}
        description="Mettre à jour les informations et le parcours de l’employé."
      />
      {material.length > 0 && (
        <aside className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-5">
          <h2 className="font-semibold">
            Matériel à récupérer en cas de départ ({material.length})
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {material.map((r) => (
              <li key={r.id}>
                <Link
                  className="hover:underline"
                  href={"/equipment/" + r.equipment.id}
                >
                  {r.equipment.assetTag} · {r.equipment.name}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Ces assignations restent actives et ne bloquent pas le départ.
          </p>
        </aside>
      )}
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
