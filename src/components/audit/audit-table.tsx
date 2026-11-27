"use client";
import { useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { DataTable, type DataColumn } from "@/components/data-table/data-table";
import { TableFilters } from "@/components/data-table/filters";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import {
  auditActionLabel,
  auditActionLabels,
  auditEntityLabel,
  auditEntityLabels,
} from "@/lib/audit-labels";
import { queryString } from "@/lib/table-query";
import type { listAudit } from "@/server/services/audit";
type Result = Awaited<ReturnType<typeof listAudit>>;
const columns: DataColumn<Result["rows"][number]>[] = [
  {
    id: "createdAt",
    label: "Date",
    required: true,
    sort: true,
    cell: (row) => (
      <Link
        className="font-medium underline-offset-4 hover:underline"
        href={`/admin/audit/${row.id}`}
      >
        {formatDate(row.createdAt)}
      </Link>
    ),
  },
  { id: "user", label: "Auteur", cell: (row) => row.user?.name ?? "Système" },
  {
    id: "action",
    label: "Action",
    sort: true,
    cell: (row) => (
      <span title={row.action}>{auditActionLabel(row.action)}</span>
    ),
  },
  {
    id: "entityType",
    label: "Type d’entité",
    sort: true,
    cell: (row) => auditEntityLabel(row.entityType),
  },
  {
    id: "entityId",
    label: "Identifiant",
    cell: (row) => <span className="font-mono text-xs">{row.entityId}</span>,
  },
];
export function AuditTable({
  result,
  businessOnly,
}: {
  result: Result;
  businessOnly: boolean;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const options = (
    labels: Record<string, string>,
    current: string | undefined,
  ) =>
    Object.entries({
      ...labels,
      ...(current && !Object.hasOwn(labels, current)
        ? { [current]: current }
        : {}),
    }).map(([value, label]) => ({ value, label }));
  async function download() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch(
        "/api/admin/audit/export?" + queryString(result.query),
        { cache: "no-store" },
      );
      if (!response.ok) {
        const body = await response.json();
        setError(body.error ?? "L’export a échoué.");
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "harnois-audit.csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("L’export a échoué. Réessayez.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs leading-5 text-muted-foreground">
          {businessOnly
            ? "Événements métier uniquement."
            : "Événements métier et de sécurité."}{" "}
          Dates affichées dans le fuseau Europe/Paris.
        </p>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void download()}
        >
          <Download className="size-4" />
          {busy ? "Préparation…" : "Exporter la sélection"}
        </Button>
      </div>
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-xl bg-danger/10 p-4 text-sm text-danger"
        >
          {error}
        </p>
      )}
      <TableFilters
        query={result.query}
        fields={[
          { name: "from", label: "Du", type: "date" },
          { name: "to", label: "Au", type: "date" },
          { name: "userId", label: "Identifiant auteur" },
          {
            name: "entityType",
            label: "Type d’entité",
            options: options(auditEntityLabels, result.query.entityType),
          },
          {
            name: "action",
            label: "Action",
            options: options(auditActionLabels, result.query.action),
          },
          { name: "entityId", label: "Identifiant entité" },
        ]}
        sortOptions={columns
          .filter((c) => c.sort)
          .map((c) => ({ value: c.id, label: c.label }))}
      />
      <DataTable {...result} columns={columns} label="Journal d’audit" />
      <p className="mt-4 text-xs text-muted-foreground">
        L’export inclut toute la sélection filtrée, jusqu’à 10 000 lignes.
        Chaque export est journalisé.
      </p>
    </>
  );
}
