"use client";
import Link from "next/link";
import { useState } from "react";
import { Download } from "lucide-react";
import type {
  listEmployees,
  employeeOptions,
} from "@/server/services/employees";
import {
  employeeStatuses,
  employeeStatusLabels,
} from "@/lib/employee-validation";
import { queryString } from "@/lib/table-query";
import { DataTable, type DataColumn } from "@/components/data-table/data-table";
import { TableFilters } from "@/components/data-table/filters";
import { Button } from "@/components/ui/button";
import { EmployeeStatusBadge } from "./employee-status";
type Result = Awaited<ReturnType<typeof listEmployees>>;
export function EmployeeTable({
  result,
  options,
  canExport,
}: {
  result: Result;
  options: Awaited<ReturnType<typeof employeeOptions>>;
  canExport: boolean;
}) {
  const [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const columns: DataColumn<Result["rows"][number]>[] = [
    {
      id: "lastName",
      label: "Collaborateur",
      required: true,
      sort: true,
      cell: (row) => (
        <Link
          className="font-medium hover:underline"
          href={`/employees/${row.id}`}
        >
          {row.firstName} {row.lastName}
        </Link>
      ),
    },
    { id: "email", label: "Email", sort: true, cell: (row) => row.email },
    {
      id: "jobTitle",
      label: "Poste",
      sort: true,
      cell: (row) => row.jobTitle ?? "—",
    },
    {
      id: "organization",
      label: "Organisation / pôle",
      cell: (row) => (
        <>
          <p>{row.organization?.name ?? "—"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.department?.name}
          </p>
        </>
      ),
    },
    { id: "location", label: "Site", cell: (row) => row.location?.name ?? "—" },
    {
      id: "status",
      label: "Statut",
      sort: true,
      cell: (row) => <EmployeeStatusBadge status={row.status} />,
    },
    {
      id: "manager",
      label: "Manager",
      cell: (row) =>
        row.manager ? row.manager.firstName + " " + row.manager.lastName : "—",
    },
  ];
  async function download() {
    setError("");
    setPending(true);
    try {
      const response = await fetch(
        "/api/employees/export?" + queryString(result.query),
      );
      if (!response.ok) {
        const body = await response.json();
        setError(body.error ?? "Export impossible.");
        return;
      }
      const url = URL.createObjectURL(await response.blob()),
        link = document.createElement("a");
      link.href = url;
      link.download = "harnois-employes.csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Export impossible. Réessayez.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <TableFilters
        query={result.query}
        search
        fields={[
          {
            name: "organizationId",
            label: "Organisation",
            options: options.organizations.map((row) => ({
              value: row.id,
              label: row.name,
            })),
          },
          {
            name: "departmentId",
            label: "Pôle",
            options: options.departments
              .filter(
                (row) =>
                  !result.query.organizationId ||
                  row.organizationId === result.query.organizationId,
              )
              .map((row) => ({ value: row.id, label: row.name })),
          },
          {
            name: "locationId",
            label: "Site",
            options: options.locations.map((row) => ({
              value: row.id,
              label: row.name,
            })),
          },
          {
            name: "status",
            label: "Statut",
            options: employeeStatuses.map((value) => ({
              value,
              label: employeeStatusLabels[value],
            })),
          },
          {
            name: "managerId",
            label: "Manager",
            options: options.managers.map((row) => ({
              value: row.id,
              label: row.firstName + " " + row.lastName,
            })),
          },
        ]}
        sortOptions={[
          { value: "lastName", label: "Nom" },
          { value: "firstName", label: "Prénom" },
          { value: "email", label: "Email" },
          { value: "status", label: "Statut" },
          { value: "jobTitle", label: "Poste" },
        ]}
      />
      {canExport && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Export de la sélection filtrée · téléphone exclu · 10 000 lignes
            maximum
          </p>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => void download()}
          >
            <Download className="size-4" />
            {pending ? "Export…" : "Exporter la sélection"}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      )}
      <DataTable
        label="Employés"
        {...result}
        columns={columns}
        mobileCard={(row, visible) => (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/employees/${row.id}`} className="font-semibold">
                {row.firstName} {row.lastName}
              </Link>
              {visible.includes("status") && (
                <EmployeeStatusBadge status={row.status} />
              )}
            </div>
            {visible.includes("jobTitle") && (
              <p className="text-sm text-muted-foreground">
                {row.jobTitle ?? "Poste non renseigné"}
              </p>
            )}
            {visible.includes("email") && (
              <p className="text-sm break-all">{row.email}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {[
                visible.includes("organization") && row.organization?.name,
                visible.includes("organization") && row.department?.name,
                visible.includes("location") && row.location?.name,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {visible.includes("manager") && row.manager && (
              <p className="text-xs text-muted-foreground">
                Manager : {row.manager.firstName} {row.manager.lastName}
              </p>
            )}
          </div>
        )}
      />
    </div>
  );
}
