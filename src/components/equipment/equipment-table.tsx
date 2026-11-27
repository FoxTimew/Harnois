"use client";
import Link from "next/link";
import { useState } from "react";
import type {
  listEquipment,
  equipmentOptions,
} from "@/server/services/equipment";
import { equipmentStatusLabels } from "@/lib/equipment-validation";
import { queryString } from "@/lib/table-query";
import { displayCivilDate } from "@/lib/date-only";
import { DataTable, type DataColumn } from "@/components/data-table/data-table";
import { TableFilters } from "@/components/data-table/filters";
import { EquipmentStatus, WarrantyBadges } from "./status";
import { DownloadButton } from "./download";
import { LabelsPanel } from "./labels-panel";
type Result = Awaited<ReturnType<typeof listEquipment>>;
export function EquipmentTable({
  result,
  options,
  canExport,
}: {
  result: Result;
  options: Awaited<ReturnType<typeof equipmentOptions>>;
  canExport: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const columns: DataColumn<Result["rows"][number]>[] = [
    {
      id: "select",
      label: "Étiquettes",
      cell: (r) => (
        <input
          type="checkbox"
          aria-label={"Sélectionner " + r.assetTag}
          checked={selected.includes(r.id)}
          onChange={(e) =>
            setSelected((v) =>
              e.target.checked ? [...v, r.id] : v.filter((id) => id !== r.id),
            )
          }
        />
      ),
    },
    {
      id: "assetTag",
      label: "Inventaire",
      sort: true,
      required: true,
      cell: (r) => (
        <Link
          className="font-medium text-primary hover:underline"
          href={"/equipment/" + r.id}
        >
          {r.assetTag}
        </Link>
      ),
    },
    {
      id: "name",
      label: "Équipement",
      sort: true,
      cell: (r) => (
        <>
          <p className="font-medium">{r.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {[r.brand, r.model].filter(Boolean).join(" · ")}
          </p>
        </>
      ),
    },
    { id: "category", label: "Catégorie", cell: (r) => r.category.name },
    {
      id: "status",
      label: "Statut",
      sort: true,
      cell: (r) => <EquipmentStatus status={r.status} />,
    },
    {
      id: "employee",
      label: "Détenteur",
      cell: (r) =>
        r.assignments[0] ? (
          <Link href={"/employees/" + r.assignments[0].employeeId}>
            {r.assignments[0].employee.firstName +
              " " +
              r.assignments[0].employee.lastName}
            {r.assignments[0].employee.status === "LEFT" && (
              <p className="text-xs text-danger">Employé parti · à récupérer</p>
            )}
          </Link>
        ) : (
          "—"
        ),
    },
    { id: "location", label: "Site", cell: (r) => r.location?.name ?? "—" },
    {
      id: "warrantyEndDate",
      label: "Garantie",
      sort: true,
      cell: (r) => (
        <>
          {displayCivilDate(r.warrantyEndDate)}
          <WarrantyBadges row={r} />
        </>
      ),
    },
  ];
  return (
    <div className="space-y-4">
      <TableFilters
        query={result.query}
        search
        searchPlaceholder="Nom, marque, série, inventaire…"
        sortOptions={[
          { value: "assetTag", label: "Inventaire" },
          { value: "name", label: "Désignation" },
          { value: "status", label: "Statut" },
          { value: "warrantyEndDate", label: "Garantie" },
        ]}
        fields={[
          {
            name: "categoryId",
            label: "Catégorie et sous-catégories",
            options: options.categories.map((r) => ({
              value: r.id,
              label: r.name,
            })),
          },
          {
            name: "status",
            label: "Statut",
            options: Object.entries(equipmentStatusLabels).map(
              ([value, label]) => ({ value, label }),
            ),
          },
          {
            name: "locationId",
            label: "Site",
            options: options.locations.map((r) => ({
              value: r.id,
              label: r.name,
            })),
          },
          {
            name: "supplierId",
            label: "Fournisseur",
            options: options.suppliers.map((r) => ({
              value: r.id,
              label: r.name,
            })),
          },
          {
            name: "employeeId",
            label: "Détenteur",
            options: options.employees.map((r) => ({
              value: r.id,
              label: r.firstName + " " + r.lastName,
            })),
          },
          {
            name: "warranty",
            label: "Garantie",
            options: [
              { value: "expired", label: "Expirée" },
              { value: "soon", label: "Moins de 60 jours" },
              { value: "none", label: "Non renseignée" },
            ],
          },
          {
            name: "departed",
            label: "Départs",
            options: [{ value: "true", label: "Assigné à un employé parti" }],
          },
        ]}
      />
      <div className="flex flex-wrap items-start gap-3">
        {canExport && (
          <DownloadButton
            url={"/api/equipment/export?" + queryString(result.query)}
            filename="harnois-equipements.csv"
          >
            Exporter les résultats
          </DownloadButton>
        )}
        {selected.length > 0 && <LabelsPanel ids={selected} />}
      </div>
      <DataTable
        rows={result.rows}
        total={result.total}
        query={result.query}
        columns={columns}
        label="Équipements"
      />
    </div>
  );
}
