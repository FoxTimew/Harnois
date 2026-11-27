"use client";
import { useMemo, useTransition, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  useTable,
  tableFeatures,
  rowPaginationFeature,
  rowSortingFeature,
  columnVisibilityFeature,
} from "@tanstack/react-table";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowDown, ArrowUp, SlidersHorizontal, Inbox } from "lucide-react";
import { queryString } from "@/lib/table-query";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/ui/skeleton";
const features = tableFeatures({
  columnVisibilityFeature,
  rowSortingFeature,
  rowPaginationFeature,
});
export type DataColumn<T> = {
  id: string;
  label: string;
  sort?: boolean;
  required?: boolean;
  cell: (row: T) => ReactNode;
};
export function DataTable<T extends { id: string }>({
  rows,
  total,
  query,
  columns,
  label,
  error,
  loading,
  mobileCard,
}: {
  rows: T[];
  total: number;
  query: {
    page: number;
    pageSize: number;
    sort: string;
    order: "asc" | "desc";
    columns: string;
  } & Record<string, unknown>;
  columns: DataColumn<T>[];
  label: string;
  error?: string;
  loading?: boolean;
  mobileCard?: (row: T, visible: string[]) => ReactNode;
}) {
  const router = useRouter();
  const path = usePathname();
  const [pending, startTransition] = useTransition();
  const definitions = useMemo(
    () =>
      columns.map((column) => ({
        id: column.id,
        accessorFn: (row: T) => row.id,
        header: column.label,
        cell: ({ row }: { row: { original: T } }) => column.cell(row.original),
      })),
    [columns],
  );
  const visibility = useMemo(
    () =>
      Object.fromEntries(
        columns.map((column) => [
          column.id,
          column.required ||
            !query.columns ||
            query.columns.split(",").includes(column.id),
        ]),
      ),
    [columns, query.columns],
  );
  const table = useTable({
    features,
    columns: definitions,
    data: rows,
    getRowId: (row) => row.id,
    manualSorting: true,
    manualPagination: true,
    rowCount: total,
    state: {
      columnVisibility: visibility,
      sorting: [{ id: query.sort, desc: query.order === "desc" }],
      pagination: { pageIndex: query.page - 1, pageSize: query.pageSize },
    },
  });
  const change = (values: Record<string, unknown>) =>
    startTransition(() =>
      router.push(path + "?" + queryString(query, values), { scroll: false }),
    );
  const visible = columns
    .filter((column) => visibility[column.id])
    .map((column) => column.id);
  if (loading) return <TableSkeleton />;
  if (error)
    return (
      <div role="alert" className="rounded-2xl border bg-card p-8">
        <h2 className="font-semibold">Chargement impossible</h2>
        <p className="my-3 text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => router.refresh()}>
          Réessayer
        </Button>
      </div>
    );
  return (
    <div
      aria-busy={pending}
      className="overflow-hidden rounded-2xl border bg-card"
    >
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <p role="status" className="text-xs text-muted-foreground">
          {total.toLocaleString("fr-FR")} résultat{total > 1 ? "s" : ""}
          {pending ? " · Chargement…" : ""}
        </p>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="ghost" className="min-h-9 px-2 text-xs">
              <SlidersHorizontal className="size-4" />
              Colonnes
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              className="z-40 min-w-48 rounded-xl border bg-card p-2 shadow-xl"
            >
              {columns.map((column) => (
                <DropdownMenu.CheckboxItem
                  disabled={column.required}
                  key={column.id}
                  checked={visibility[column.id]}
                  className="menu-item"
                  onCheckedChange={(checked) => {
                    const ids = columns
                      .filter(
                        (item) =>
                          item.required ||
                          (item.id === column.id
                            ? checked
                            : visibility[item.id]),
                      )
                      .map((item) => item.id);
                    change({ columns: ids.join(",") || columns[0].id });
                  }}
                >
                  <span aria-hidden className="w-4">
                    {visibility[column.id] ? "✓" : ""}
                  </span>
                  {column.label}
                </DropdownMenu.CheckboxItem>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {!rows.length ? (
        <div className="px-6 py-16 text-center">
          <Inbox className="mx-auto mb-4 size-8 text-muted-foreground" />
          <h2 className="font-medium">Aucun résultat</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Essayez d’autres filtres ou revenez plus tard.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{label}</caption>
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  {columns
                    .filter((column) => visibility[column.id])
                    .map((column) => (
                      <th
                        scope="col"
                        key={column.id}
                        aria-sort={
                          column.sort
                            ? query.sort === column.id
                              ? query.order === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                            : undefined
                        }
                        className="px-5 py-3 font-medium"
                      >
                        {column.sort ? (
                          <button
                            className="flex min-h-8 items-center gap-2"
                            onClick={() =>
                              change({
                                sort: column.id,
                                order:
                                  query.sort === column.id &&
                                  query.order === "asc"
                                    ? "desc"
                                    : "asc",
                                page: 1,
                              })
                            }
                          >
                            {column.label}
                            {query.sort === column.id &&
                              (query.order === "asc" ? (
                                <ArrowUp className="size-3" />
                              ) : (
                                <ArrowDown className="size-3" />
                              ))}
                          </button>
                        ) : (
                          column.label
                        )}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/30">
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="max-w-72 px-5 py-5 break-words"
                      >
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y md:hidden">
            {rows.map((row) => (
              <article key={row.id} className="p-5">
                {mobileCard ? (
                  mobileCard(row, visible)
                ) : (
                  <dl className="space-y-3">
                    {columns
                      .filter((column) => visibility[column.id])
                      .map((column) => (
                        <div key={column.id}>
                          <dt className="text-xs text-muted-foreground">
                            {column.label}
                          </dt>
                          <dd className="mt-1 text-sm break-words">
                            {column.cell(row)}
                          </dd>
                        </div>
                      ))}
                  </dl>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-xs text-muted-foreground">
        <label className="flex items-center gap-2">
          Par page
          <select
            aria-label="Résultats par page"
            value={query.pageSize}
            onChange={(event) =>
              change({ pageSize: event.target.value, page: 1 })
            }
            className="min-h-10 rounded-lg border bg-card px-2"
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size}>{size}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            disabled={pending || query.page <= 1}
            onClick={() => change({ page: query.page - 1 })}
            className="px-2 text-xs"
          >
            Précédent
          </Button>
          <span>
            Page {query.page} / {Math.max(1, Math.ceil(total / query.pageSize))}
          </span>
          <Button
            variant="ghost"
            disabled={pending || query.page * query.pageSize >= total}
            onClick={() => change({ page: query.page + 1 })}
            className="px-2 text-xs"
          >
            Suivant
          </Button>
        </div>
      </div>
    </div>
  );
}
