import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/server/auth/require-page-user";
import { getDb } from "@/server/db";
import {
  employeeDetail,
  employeeAccountLinkOptions,
} from "@/server/services/employees";
import { MfaService } from "@/server/services/mfa";
import { EmployeeAccountLink } from "@/components/employees/employee-account-link";
import { listAudit } from "@/server/services/audit";
import { ServiceError } from "@/server/services/errors";
import { PageHeading } from "@/components/layout/page-heading";
import { EmployeeStatusBadge } from "@/components/employees/employee-status";
import { buttonVariants } from "@/components/ui/button";
import { displayCivilDate } from "@/lib/date-only";
import { auditActionLabel } from "@/lib/audit-labels";
import { formatDate } from "@/lib/format";
import type { SearchParams } from "@/lib/table-query";
const tabs = [
  ["information", "Informations"],
  ["equipment", "Équipements"],
  ["software", "Logiciels / licences"],
  ["accounts", "Comptes"],
  ["tickets", "Tickets"],
  ["checklists", "Checklists"],
  ["history", "Historique"],
] as const;
export default async function EmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const { user, session } = await requirePageUser("/employees/" + id, {
    permission: {
      action: "read",
      resource: { type: "employees", ownerEmployeeId: id },
    },
  });
  const actor = { userId: user.id, sessionId: session.id };
  let row;
  try {
    row = await employeeDetail(getDb(), actor, id);
  } catch (error) {
    if (error instanceof ServiceError && error.status === 404) notFound();
    throw error;
  }
  const edit = user.role === "ADMIN" || user.role === "IT_MANAGER";
  const requested = (await searchParams).tab;
  const tab = tabs.find(([key]) => key === requested)?.[0] ?? "information";
  const accountLink =
    user.role === "ADMIN" && tab === "information"
      ? {
          options: await employeeAccountLinkOptions(getDb(), actor, id),
          initialMfa: await new MfaService().status(actor),
        }
      : null;
  const history =
    tab === "history" && edit
      ? await listAudit(getDb(), actor, {
          entityType: "Employee",
          entityId: id,
          pageSize: 50,
        })
      : null;
  const entries = [
    ["Email professionnel", row.email],
    ["Poste", row.jobTitle ?? "—"],
    ["Organisation", row.organization?.name ?? "—"],
    ["Pôle", row.department?.name ?? "—"],
    ["Site", row.location?.name ?? "—"],
    [
      "Manager",
      row.manager ? row.manager.firstName + " " + row.manager.lastName : "—",
    ],
    ...(user.role !== "TECHNICIAN"
      ? [
          ["Téléphone", row.phone ?? "—"],
          ["Date d’arrivée", displayCivilDate(row.startDate ?? null)],
          ["Date de départ", displayCivilDate(row.endDate ?? null)],
        ]
      : []),
  ];
  return (
    <section className="max-w-6xl">
      {user.role !== "EMPLOYEE" && (
        <Link
          href="/employees"
          className="mb-5 inline-block text-sm text-muted-foreground hover:underline"
        >
          ← Tous les employés
        </Link>
      )}
      <PageHeading
        eyebrow="ÉQUIPE / FICHE EMPLOYÉ"
        title={row.firstName + " " + row.lastName}
        description={row.jobTitle ?? "Fiche professionnelle"}
      >
        <EmployeeStatusBadge status={row.status} />
        {edit && (
          <Link
            className={buttonVariants({ variant: "outline" })}
            href={`/employees/${id}/edit`}
          >
            Modifier la fiche
          </Link>
        )}
      </PageHeading>
      {edit && row.status === "LEFT" && row.user?.isActive && (
        <p
          role="status"
          className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm"
        >
          Cette personne est partie, mais son compte Harnois est actif.{" "}
          {user.role === "ADMIN"
            ? "Désactivez-le depuis la modification de la fiche ou l’administration des utilisateurs."
            : "Demandez à un administrateur de désactiver ce compte."}
        </p>
      )}
      <nav
        aria-label="Sections de la fiche"
        className="mb-6 flex gap-2 overflow-x-auto border-b pb-3"
      >
        {tabs.map(([key, label]) => (
          <Link
            key={key}
            aria-current={tab === key ? "page" : undefined}
            href={`/employees/${id}?tab=${key}`}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm ${tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "information" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <section className="rounded-2xl border bg-card p-6 sm:p-8">
            <h2 className="mb-6 text-lg font-semibold">
              Informations professionnelles
            </h2>
            <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {entries.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-2 text-sm break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <aside className="h-fit rounded-2xl border bg-card p-6">
            <h2 className="font-semibold">Accès à Harnois</h2>
            {edit ? (
              <>
                <p className="my-3 text-sm text-muted-foreground">
                  {row.user
                    ? "Un compte est lié à cette fiche."
                    : "Cette fiche n’est pas encore liée à un compte."}
                </p>
                {!row.user && (
                  <Link
                    href={`/admin/invitations?employeeId=${id}`}
                    className={buttonVariants({
                      variant: "outline",
                      className: "w-full",
                    })}
                  >
                    Inviter dans Harnois
                  </Link>
                )}
                {accountLink && (
                  <EmployeeAccountLink employeeId={id} {...accountLink} />
                )}
              </>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Les accès sont gérés par l’équipe informatique.
              </p>
            )}
          </aside>
        </div>
      ) : tab === "history" ? (
        <section className="rounded-2xl border bg-card p-6">
          <h2 className="mb-5 text-lg font-semibold">Historique de la fiche</h2>
          {history ? (
            <>
              {history.rows.length ? (
                <ol className="space-y-4">
                  {history.rows.map((event) => (
                    <li
                      key={event.id}
                      className="border-l-2 border-primary/30 pl-4"
                    >
                      <p className="text-sm font-medium">
                        {auditActionLabel(event.action)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(event.createdAt)} ·{" "}
                        {event.user?.name ?? "Système"}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aucun événement enregistré pour cette fiche.
                </p>
              )}
              <Link
                href={`/admin/audit?entityType=Employee&entityId=${id}`}
                className="mt-6 inline-block text-sm text-primary hover:underline"
              >
                Consulter le journal filtré ({history.total}) →
              </Link>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              L’historique est réservé aux administrateurs et responsables
              informatiques.
            </p>
          )}
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed bg-card p-10 text-center">
          <h2 className="text-lg font-semibold">
            {tabs.find(([key]) => key === tab)?.[1]}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Cette section sera disponible lors de la livraison du module
            correspondant.
          </p>
        </section>
      )}
    </section>
  );
}
