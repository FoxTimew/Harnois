"use client";
import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { queryString } from "@/lib/table-query";
export type FilterField = {
  name: string;
  label: string;
  type?: "date" | "text";
  options?: { value: string; label: string }[];
};
export function TableFilters({
  query,
  fields,
  search = false,
  searchPlaceholder = "Nom ou adresse email…",
  sortOptions,
}: {
  query: Record<string, unknown>;
  fields: FilterField[];
  search?: boolean;
  searchPlaceholder?: string;
  sortOptions: { value: string; label: string }[];
}) {
  const router = useRouter();
  const path = usePathname();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <form
      key={queryString(query)}
      className="mb-5 flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        const values = Object.fromEntries(new FormData(event.currentTarget));
        startTransition(() =>
          router.push(path + "?" + queryString(query, { ...values, page: 1 }), {
            scroll: false,
          }),
        );
      }}
    >
      {search && (
        <label className="min-w-48 flex-1 text-xs text-muted-foreground">
          Rechercher
          <span className="relative mt-2 block">
            <Search aria-hidden className="absolute top-3 left-3 size-4" />
            <input
              name="q"
              type="search"
              maxLength={100}
              defaultValue={String(query.q ?? "")}
              placeholder={searchPlaceholder}
              className="field pl-10"
              onChange={(event) => {
                const form = event.currentTarget.form;
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => form?.requestSubmit(), 500);
              }}
            />
          </span>
        </label>
      )}
      {fields.map((field) => (
        <label
          key={field.name}
          className="min-w-32 flex-1 text-xs text-muted-foreground"
        >
          {field.label}
          {field.options ? (
            <select
              className="field mt-2"
              name={field.name}
              defaultValue={String(query[field.name] ?? "")}
            >
              <option value="">Tous</option>
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="field mt-2"
              name={field.name}
              type={field.type ?? "text"}
              defaultValue={String(query[field.name] ?? "")}
              maxLength={128}
            />
          )}
        </label>
      ))}
      <label className="min-w-32 text-xs text-muted-foreground">
        Trier par
        <select
          name="sort"
          defaultValue={String(query.sort)}
          className="field mt-2"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-muted-foreground">
        Ordre
        <select
          name="order"
          defaultValue={String(query.order)}
          className="field mt-2"
        >
          <option value="asc">Croissant</option>
          <option value="desc">Décroissant</option>
        </select>
      </label>
      <Button variant="outline" disabled={pending}>
        Filtrer
      </Button>
      <Button type="button" variant="ghost" onClick={() => router.push(path)}>
        Effacer
      </Button>
    </form>
  );
}
