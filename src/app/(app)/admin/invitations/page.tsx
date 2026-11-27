import { requirePageUser } from "@/server/auth/require-page-user";
import { getDb } from "@/server/db";
import { invitationOverview } from "@/server/services/invitations";
import { AdminInvitations } from "@/components/auth/admin-invitations";
import { employeeDetail } from "@/server/services/employees";
import { recordId } from "@/lib/admin-validation";
import type { SearchParams } from "@/lib/table-query";
export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requirePageUser("/admin/invitations", {
    permission: {
      action: "read",
      resource: { type: "invitations", invitationRole: "EMPLOYEE" },
    },
  });
  const overview = await invitationOverview(getDb(), context.user.id);
  const requested = recordId.safeParse((await searchParams).employeeId);
  const employee =
    requested.success &&
    overview.employees.some((row) => row.id === requested.data)
      ? await employeeDetail(
          getDb(),
          { userId: context.user.id, sessionId: context.session.id },
          requested.data,
        )
      : null;
  return (
    <section>
      <p className="text-xs tracking-widest text-accent-foreground">
        {context.user.role === "ADMIN" ? "ADMINISTRATION" : "GESTION"}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        Invitations
      </h1>
      <p className="mt-4 mb-8 text-sm text-muted-foreground">
        Ouvrez l’accès à votre équipe, une personne à la fois.
      </p>
      <AdminInvitations
        key={employee?.id ?? "empty"}
        {...overview}
        prefill={
          employee
            ? { employeeId: employee.id, email: employee.email }
            : undefined
        }
      />
    </section>
  );
}
