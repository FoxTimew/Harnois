import Link from "next/link";
import type {
  equipmentDetail,
  employeeEquipment,
} from "@/server/services/equipment";
import { conditionLabels } from "@/lib/equipment-validation";
import { displayCivilDate } from "@/lib/date-only";
import { formatDate } from "@/lib/format";
import { DownloadButton } from "./download";
type Detail = Awaited<ReturnType<typeof equipmentDetail>>;
export function EquipmentHistory({
  rows,
  documents,
}: {
  rows: Detail["history"];
  documents: boolean;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-8">
      <h2 className="mb-6 text-lg font-semibold">Historique des mouvements</h2>
      {rows.length ? (
        <ol className="space-y-6">
          {rows.map((r) => (
            <li key={r.id} className="border-l-2 border-primary/30 pl-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {r.employee.firstName} {r.employee.lastName}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {r.kind === "LOAN"
                      ? "Prêt temporaire"
                      : "Assignation permanente"}{" "}
                    · {formatDate(r.assignedAt)}
                  </p>
                  <p className="mt-2 text-sm">
                    {r.returnedAt
                      ? (r.closureReason === "LOST"
                          ? "Perte déclarée"
                          : "Restitué") +
                        " le " +
                        formatDate(r.returnedAt)
                      : "En cours"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Remise :{" "}
                    {r.conditionOut
                      ? conditionLabels[r.conditionOut]
                      : "Non renseigné"}
                    {r.conditionIn
                      ? " · Retour : " + conditionLabels[r.conditionIn]
                      : ""}
                    {r.expectedReturnDate
                      ? " · Prévu : " + displayCivilDate(r.expectedReturnDate)
                      : ""}
                  </p>
                  {r.notes && (
                    <p className="mt-3 text-sm whitespace-pre-wrap">
                      {r.notes}
                    </p>
                  )}
                  {r.returnNotes && (
                    <p className="mt-2 text-sm whitespace-pre-wrap">
                      {r.returnNotes}
                    </p>
                  )}
                </div>
                {documents && (
                  <div className="flex flex-wrap gap-2">
                    <DownloadButton
                      url="/api/equipment/certificate"
                      filename="harnois-remise.pdf"
                      body={{ assignmentIds: [r.id], kind: "handover" }}
                    >
                      Attestation de remise
                    </DownloadButton>
                    {r.returnedAt && r.closureReason === "RETURNED" && (
                      <DownloadButton
                        url="/api/equipment/certificate"
                        filename="harnois-retour.pdf"
                        body={{ assignmentIds: [r.id], kind: "return" }}
                      >
                        Attestation de retour
                      </DownloadButton>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">
          Aucun mouvement pour cet équipement.
        </p>
      )}
    </section>
  );
}
export function EmployeeEquipment({
  rows,
  personal = false,
}: {
  rows: Awaited<ReturnType<typeof employeeEquipment>>;
  personal?: boolean;
}) {
  const active = rows.filter((r) => !r.returnedAt);
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-5 sm:p-8">
        <h2 className="mb-5 text-lg font-semibold">
          Matériel en cours ({active.length})
        </h2>
        {active.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {active.map((r) => (
              <article className="rounded-xl border p-4" key={r.id}>
                <p className="text-xs font-medium tracking-wider text-muted-foreground">
                  {r.equipment.assetTag}
                </p>
                <Link
                  className="mt-2 block font-semibold text-primary hover:underline"
                  href={"/equipment/" + r.equipment.id}
                >
                  {r.equipment.name}
                </Link>
                <p className="mt-3 text-sm">
                  {r.kind === "LOAN"
                    ? "Prêt · retour prévu " +
                      displayCivilDate(r.expectedReturnDate)
                    : "Assignation permanente"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Depuis le {formatDate(r.assignedAt)}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucun équipement actuellement attribué.
          </p>
        )}
      </section>
      <section className="rounded-2xl border bg-card p-5 sm:p-8">
        <h2 className="mb-5 text-lg font-semibold">Historique personnel</h2>
        <ol className="space-y-4">
          {rows
            .filter((r) => r.returnedAt)
            .map((r) => (
              <li key={r.id} className="border-l-2 border-primary/30 pl-4">
                <p className="font-medium">
                  {personal ? (
                    <span>
                      {r.equipment.assetTag} · {r.equipment.name}
                    </span>
                  ) : (
                    <Link href={"/equipment/" + r.equipment.id}>
                      {r.equipment.assetTag} · {r.equipment.name}
                    </Link>
                  )}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDate(r.assignedAt)} → {formatDate(r.returnedAt!)} ·{" "}
                  {r.closureReason === "LOST" ? "Perte déclarée" : "Restitué"}
                </p>
              </li>
            ))}
        </ol>
        {!rows.some((r) => r.returnedAt) && (
          <p className="text-sm text-muted-foreground">
            Aucune restitution enregistrée.
          </p>
        )}
      </section>
    </div>
  );
}
