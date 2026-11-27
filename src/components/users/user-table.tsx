"use client";
import Link from "next/link";
import { DataTable, type DataColumn } from "@/components/data-table/data-table";
import { TableFilters } from "@/components/data-table/filters";
import { StatusBadge } from "@/components/ui/status-badge";
import { roleLabels } from "@/lib/auth-messages";
import { formatDate } from "@/lib/format";
import type { listUsers } from "@/server/services/users";
type Result = Awaited<ReturnType<typeof listUsers>>;
type Row = Result["rows"][number];
const columns: DataColumn<Row>[] = [
  {
    id: "name",
    label: "Nom",
    required: true,
    sort: true,
    cell: (row) => (
      <Link
        href={`/admin/users/${row.id}`}
        className="font-medium underline-offset-4 hover:underline"
      >
        {row.name}
      </Link>
    ),
  },
  { id: "email", label: "Email", sort: true, cell: (row) => row.email },
  {
    id: "role",
    label: "Rôle",
    sort: true,
    cell: (row) => roleLabels[row.role],
  },
  {
    id: "isActive",
    label: "Statut",
    sort: true,
    cell: (row) => (
      <StatusBadge tone={row.isActive ? "positive" : "neutral"}>
        {row.isActive ? "Actif" : "Désactivé"}
      </StatusBadge>
    ),
  },
  {
    id: "mfa",
    label: "2FA",
    cell: (row) => (
      <StatusBadge tone={row.mfaConfigured ? "positive" : "warning"}>
        {row.mfaConfigured ? "Configurée" : "À configurer"}
      </StatusBadge>
    ),
  },
  {
    id: "lastLoginAt",
    label: "Dernière connexion",
    sort: true,
    cell: (row) => formatDate(row.lastLoginAt),
  },
  {
    id: "employee",
    label: "Employé",
    cell: (row) =>
      row.employee
        ? `${row.employee.firstName} ${row.employee.lastName}`
        : "Non lié",
  },
];
export function UserTable({ result }: { result: Result }) {
  return (
    <>
      <TableFilters
        query={result.query}
        search
        fields={[
          {
            name: "role",
            label: "Rôle",
            options: Object.entries(roleLabels).map(([value, label]) => ({
              value,
              label,
            })),
          },
          {
            name: "active",
            label: "Statut",
            options: [
              { value: "true", label: "Actif" },
              { value: "false", label: "Désactivé" },
            ],
          },
        ]}
        sortOptions={columns
          .filter((c) => c.sort)
          .map((c) => ({ value: c.id, label: c.label }))}
      />
      <DataTable {...result} columns={columns} label="Utilisateurs" />
    </>
  );
}
