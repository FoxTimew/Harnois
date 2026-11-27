import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePageUser } from "@/server/auth/require-page-user";
import { getDb } from "@/server/db";
import { equipmentOptions, equipmentDetail } from "@/server/services/equipment";
import { ServiceError } from "@/server/services/errors";
import {
  EquipmentStatus,
  EquipmentCondition,
  WarrantyBadges,
} from "@/components/equipment/status";
import { EquipmentHistory } from "@/components/equipment/equipment-history";
import { AssignmentPanel } from "@/components/equipment/assignment-panel";
import { LabelsPanel } from "@/components/equipment/labels-panel";
import { PageHeading } from "@/components/layout/page-heading";
import { buttonVariants } from "@/components/ui/button";
import { displayCivilDate } from "@/lib/date-only";
import { formatMoney } from "@/lib/format";
export default async function EquipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    { user, session } = await requirePageUser("/equipment/" + id),
    actor = { userId: user.id, sessionId: session.id };
  let row;
  try {
    row = await equipmentDetail(getDb(), actor, id);
  } catch (e) {
    if (e instanceof ServiceError && e.status === 404) notFound();
    if (e instanceof ServiceError && e.status === 403) redirect("/forbidden");
    throw e;
  }
  const staff = user.role !== "EMPLOYEE",
    options = staff ? await equipmentOptions(getDb(), actor) : null;
  const entries = [
    ["Numéro de série", row.serialNumber ?? "—"],
    [
      "Marque / modèle",
      [row.brand, row.model].filter(Boolean).join(" · ") || "—",
    ],
    ["Catégorie", row.category.name],
    ["Site", row.location?.name ?? "—"],
    ["Fournisseur", row.supplier?.name ?? "—"],
    ["Date d’achat", displayCivilDate(row.purchaseDate)],
    ["Fin de garantie", displayCivilDate(row.warrantyEndDate)],
    [
      "Amortissement",
      row.depreciationMonths ? row.depreciationMonths + " mois" : "—",
    ],
    ...("purchasePrice" in row
      ? [
          [
            "Prix d’achat HT",
            row.purchasePrice ? formatMoney(row.purchasePrice) : "—",
          ],
        ]
      : []),
  ];
  return (
    <section className="max-w-6xl">
      <Link
        className="mb-4 inline-block text-sm text-muted-foreground hover:text-foreground"
        href={staff ? "/equipment" : "/my-equipment"}
      >
        ← {staff ? "Équipements" : "Mon matériel"}
      </Link>
      <PageHeading
        eyebrow={"PARC / " + row.assetTag}
        title={row.name}
        description="Informations et historique du matériel."
      >
        {staff && (
          <Link
            className={buttonVariants({ variant: "outline" })}
            href={"/equipment/" + id + "/edit"}
          >
            Modifier
          </Link>
        )}
      </PageHeading>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <EquipmentStatus status={row.status} />
        <EquipmentCondition condition={row.condition} />
        <WarrantyBadges row={row} />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-5 sm:p-8">
            <h2 className="mb-5 text-lg font-semibold">
              Informations du matériel
            </h2>
            <dl className="grid gap-5 sm:grid-cols-2">
              {entries.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-2 text-sm break-words">{value}</dd>
                </div>
              ))}
            </dl>
            {row.notes && (
              <p className="mt-6 border-t pt-5 text-sm whitespace-pre-wrap">
                {row.notes}
              </p>
            )}
          </section>
          <section className="rounded-2xl border bg-card p-5 sm:p-8">
            <h2 className="mb-5 text-lg font-semibold">Caractéristiques</h2>
            {Object.keys(row.specs).length ? (
              <dl className="grid gap-4 sm:grid-cols-2">
                {Object.entries(row.specs).map(([key, value]) => {
                  const d = row.definitions.find((d) => d.key === key);
                  return (
                    <div key={key}>
                      <dt className="text-xs text-muted-foreground">
                        {d?.label ?? key}
                        {d?.disabled ? " · désactivée" : ""}
                      </dt>
                      <dd className="mt-1 text-sm">
                        {typeof value === "boolean"
                          ? value
                            ? "Oui"
                            : "Non"
                          : String(value)}{" "}
                        {d?.unit}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucune caractéristique renseignée.
              </p>
            )}
          </section>
        </div>
        {staff && options ? (
          <aside className="space-y-5">
            <AssignmentPanel row={row} employees={options.employees} />
            <LabelsPanel ids={[id]} />
          </aside>
        ) : null}
      </div>
      <div className="mt-6">
        <EquipmentHistory rows={row.history} documents={staff} />
      </div>
    </section>
  );
}
