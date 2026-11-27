import Link from "next/link";
import { requirePageUser } from "@/server/auth/require-page-user";
import { getDb } from "@/server/db";
import { listEmployees, employeeOptions } from "@/server/services/employees";
import { EmployeeTable } from "@/components/employees/employee-table";
import { PageHeading } from "@/components/layout/page-heading";
import { buttonVariants } from "@/components/ui/button";
import type { SearchParams } from "@/lib/table-query";
export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user, session } = await requirePageUser("/employees", {
    permission: { action: "read", resource: "employees" },
  });
  const actor = { userId: user.id, sessionId: session.id };
  const [result, options] = await Promise.all([
    listEmployees(getDb(), actor, await searchParams),
    employeeOptions(getDb(), actor),
  ]);
  const edit = user.role === "ADMIN" || user.role === "IT_MANAGER";
  return (
    <section>
      <PageHeading
        eyebrow="ÉQUIPE"
        title="Employés"
        description="Les personnes, leur organisation et les étapes de leur parcours."
      >
        {edit && (
          <>
            <Link
              href="/employees/import"
              className={buttonVariants({ variant: "outline" })}
            >
              Importer un CSV
            </Link>
            <Link href="/employees/new" className={buttonVariants()}>
              Ajouter un employé
            </Link>
          </>
        )}
      </PageHeading>
      <EmployeeTable result={result} options={options} canExport={edit} />
    </section>
  );
}
