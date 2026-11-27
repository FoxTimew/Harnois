"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useForm,
  useFieldArray,
  useWatch,
  type Resolver,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Laptop,
  Monitor,
  Smartphone,
  Printer,
  Network,
  Box,
  Plus,
} from "lucide-react";
import {
  categoryMutationSchema,
  categoryIcons,
  supplierMutationSchema,
} from "@/lib/equipment-reference-validation";
import { saveEquipmentReferenceAction } from "@/app/(app)/references/equipment-actions";
import type { listCategories } from "@/server/services/categories";
import type { listSuppliers } from "@/server/services/suppliers";
import { FormPanel } from "@/components/forms/form-panel";
import { Button } from "@/components/ui/button";
import { actionMessage } from "@/lib/action-result";
const icons = {
  computer: Laptop,
  monitor: Monitor,
  phone: Smartphone,
  printer: Printer,
  network: Network,
  box: Box,
};
const iconLabels = {
  computer: "Ordinateur",
  monitor: "Écran",
  phone: "Téléphone",
  printer: "Imprimante",
  network: "Réseau",
  box: "Autre",
};
type Categories = Awaited<ReturnType<typeof listCategories>>;
type Suppliers = Awaited<ReturnType<typeof listSuppliers>>;
export function EquipmentReferenceManager({
  kind,
  rows,
  editable,
}:
  | { kind: "categories"; rows: Categories; editable: boolean }
  | { kind: "suppliers"; rows: Suppliers; editable: boolean }) {
  const [selected, setSelected] = useState<string | null>(null),
    [creating, setCreating] = useState(false);
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,1fr)]">
      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {kind === "categories" ? "Catégories" : "Fournisseurs"} (
            {rows.length})
          </h2>
          {editable && (
            <Button
              variant="outline"
              onClick={() => {
                setSelected(null);
                setCreating(true);
              }}
            >
              <Plus size={16} />
              Ajouter
            </Button>
          )}
        </div>
        <ul className="divide-y">
          {rows.map((row) => {
            const category = "path" in row ? row : null,
              Icon = category
                ? (icons[category.icon as keyof typeof icons] ?? Box)
                : Box;
            return (
              <li className="flex items-start gap-3 py-4" key={row.id}>
                <Icon size={19} className="mt-1 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">
                    {category?.path ?? row.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {category
                      ? category.inherited.length +
                        " caractéristique(s), parents inclus"
                      : "email" in row
                        ? (row.email ?? "Email non renseigné")
                        : ""}
                  </p>
                </div>
                {editable && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSelected(row.id);
                      setCreating(false);
                    }}
                  >
                    Modifier
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {!rows.length && (
          <p className="text-sm text-muted-foreground">
            Aucun élément enregistré.
          </p>
        )}
      </section>
      {editable && (creating || selected) ? (
        kind === "categories" ? (
          <CategoryForm
            key={selected ?? "new"}
            row={rows.find((r) => r.id === selected)}
            rows={rows}
            close={() => {
              setCreating(false);
              setSelected(null);
            }}
          />
        ) : (
          <SupplierForm
            key={selected ?? "new"}
            row={rows.find((r) => r.id === selected)}
            close={() => {
              setCreating(false);
              setSelected(null);
            }}
          />
        )
      ) : (
        <aside className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
          {kind === "categories"
            ? "Les caractéristiques sont héritées des catégories parentes. Le type d’un champ existant reste fixe ; un champ utilisé peut être désactivé."
            : "Un fournisseur utilisé par du matériel, un logiciel ou une facture conserve sa fiche."}
        </aside>
      )}
    </div>
  );
}
function CategoryForm({
  row,
  rows,
  close,
}: {
  row?: Categories[number];
  rows: Categories;
  close: () => void;
}) {
  const router = useRouter(),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false);
  const form = useForm<z.infer<typeof categoryMutationSchema>>({
    resolver: zodResolver(categoryMutationSchema) as Resolver<
      z.infer<typeof categoryMutationSchema>
    >,
    defaultValues: {
      id: row?.id,
      updatedAt: row?.updatedAt,
      name: row?.name ?? "",
      parentId: row?.parentId ?? null,
      icon: categoryIcons.includes(row?.icon as (typeof categoryIcons)[number])
        ? (row!.icon as (typeof categoryIcons)[number])
        : "box",
      specDefinitions: row?.specDefinitions ?? [],
      operation: "save",
    },
  });
  const fields = useFieldArray({
      control: form.control,
      name: "specDefinitions",
    }),
    definitions = useWatch({ control: form.control, name: "specDefinitions" });
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-semibold">
          {row ? "Modifier la catégorie" : "Nouvelle catégorie"}
        </h2>
        <Button variant="ghost" onClick={close}>
          Fermer
        </Button>
      </div>
      <FormPanel
        form={form}
        onSubmit={async (data) => {
          const result = await saveEquipmentReferenceAction("categories", data);
          if (!result.error) {
            router.refresh();
            close();
          }
          return result;
        }}
      >
        <label className="block space-y-2 text-sm">
          <span>Nom *</span>
          <input className="field" {...form.register("name")} />
        </label>
        <label className="block space-y-2 text-sm">
          <span>Catégorie parente</span>
          <select
            className="field"
            {...form.register("parentId", { setValueAs: (v) => v || null })}
          >
            <option value="">Aucune</option>
            {rows
              .filter((r) => r.id !== row?.id)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.path}
                </option>
              ))}
          </select>
        </label>
        <label className="block space-y-2 text-sm">
          <span>Icône</span>
          <select className="field" {...form.register("icon")}>
            {categoryIcons.map((i) => (
              <option key={i} value={i}>
                {iconLabels[i]}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="space-y-4">
          <legend className="mb-3 font-medium">Caractéristiques propres</legend>
          {fields.fields.map((f, index) => {
            const existing = row?.specDefinitions.some((d) => d.key === f.key);
            return (
              <div className="space-y-3 rounded-xl border p-3" key={f.id}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs">
                    Identifiant (ex. ram)
                    <input
                      readOnly={existing}
                      className="field mt-1"
                      {...form.register(`specDefinitions.${index}.key`)}
                    />
                  </label>
                  <label className="text-xs">
                    Libellé
                    <input
                      className="field mt-1"
                      {...form.register(`specDefinitions.${index}.label`)}
                    />
                  </label>
                  <label className="text-xs">
                    Type
                    <select
                      className="field mt-1"
                      {...form.register(`specDefinitions.${index}.type`)}
                      disabled={existing}
                    >
                      {Object.entries({
                        text: "Texte",
                        number: "Nombre",
                        boolean: "Oui / non",
                        choice: "Choix",
                      }).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    Unité
                    <input
                      className="field mt-1"
                      {...form.register(`specDefinitions.${index}.unit`)}
                    />
                  </label>
                </div>
                {definitions[index]?.type === "choice" && (
                  <label className="block text-xs">
                    Choix séparés par un point-virgule
                    <input
                      className="field mt-1"
                      defaultValue={f.choices.join(";")}
                      onChange={(e) =>
                        form.setValue(
                          `specDefinitions.${index}.choices`,
                          e.target.value
                            .split(";")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        )
                      }
                    />
                  </label>
                )}
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      {...form.register(`specDefinitions.${index}.disabled`)}
                    />
                    Désactivée
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => fields.remove(index)}
                  >
                    Retirer
                  </Button>
                </div>
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              fields.append({
                key: "",
                label: "",
                type: "text",
                unit: "",
                choices: [],
                disabled: false,
              })
            }
          >
            Ajouter une caractéristique
          </Button>
        </fieldset>
        {Object.keys(form.formState.errors).length > 0 && (
          <p role="alert" className="text-sm text-danger">
            Vérifiez le nom, les identifiants uniques et les choix des
            caractéristiques.
          </p>
        )}
      </FormPanel>
      {row && (
        <div className="mt-6 border-t pt-5">
          <label className="mb-3 flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={deleting}
              onChange={(e) => setDeleting(e.target.checked)}
            />
            Confirmer la suppression si aucun équipement ni enfant n’utilise
            cette catégorie.
          </label>
          <Button
            variant="outline"
            disabled={!deleting}
            onClick={async () => {
              const r = await saveEquipmentReferenceAction("categories", {
                ...form.getValues(),
                operation: "delete",
              });
              if (r.error) setError(actionMessage(r.error, r.details));
              else {
                router.refresh();
                close();
              }
            }}
          >
            Supprimer la catégorie inutilisée
          </Button>
          {error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
function SupplierForm({
  row,
  close,
}: {
  row?: Suppliers[number];
  close: () => void;
}) {
  const router = useRouter(),
    [deleting, setDeleting] = useState(false),
    [error, setError] = useState("");
  const form = useForm<z.infer<typeof supplierMutationSchema>>({
    resolver: zodResolver(supplierMutationSchema) as Resolver<
      z.infer<typeof supplierMutationSchema>
    >,
    defaultValues: {
      id: row?.id,
      updatedAt: row?.updatedAt,
      name: row?.name ?? "",
      email: row?.email ?? null,
      phone: row?.phone ?? null,
      website: row?.website ?? null,
      notes: row?.notes ?? null,
      operation: "save",
    },
  });
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-semibold">
          {row ? "Modifier le fournisseur" : "Nouveau fournisseur"}
        </h2>
        <Button variant="ghost" onClick={close}>
          Fermer
        </Button>
      </div>
      <FormPanel
        form={form}
        onSubmit={async (data) => {
          const r = await saveEquipmentReferenceAction("suppliers", data);
          if (!r.error) {
            router.refresh();
            close();
          }
          return r;
        }}
      >
        {(
          [
            ["name", "Nom *", "text"],
            ["email", "Email", "email"],
            ["phone", "Téléphone international", "tel"],
            ["website", "Site web", "url"],
          ] as const
        ).map(([name, label, type]) => (
          <label className="block space-y-2 text-sm" key={name}>
            <span>{label}</span>
            <input
              type={type}
              className="field"
              {...form.register(name, { setValueAs: (v) => v || null })}
            />
            {form.formState.errors[name] && (
              <span className="text-xs text-danger">
                {form.formState.errors[name]?.message}
              </span>
            )}
          </label>
        ))}
        <label className="block space-y-2 text-sm">
          <span>Notes</span>
          <textarea
            className="field"
            {...form.register("notes", { setValueAs: (v) => v || null })}
          />
        </label>
      </FormPanel>
      {row && (
        <div className="mt-6 border-t pt-5">
          <label className="mb-3 flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={deleting}
              onChange={(e) => setDeleting(e.target.checked)}
            />
            Confirmer la suppression si le fournisseur est inutilisé.
          </label>
          <Button
            variant="outline"
            disabled={!deleting}
            onClick={async () => {
              const r = await saveEquipmentReferenceAction("suppliers", {
                ...form.getValues(),
                operation: "delete",
              });
              if (r.error) setError(actionMessage(r.error, r.details));
              else {
                router.refresh();
                close();
              }
            }}
          >
            Supprimer le fournisseur inutilisé
          </Button>
          {error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
