"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  equipmentFieldsSchema,
  directTransitions,
  equipmentStatusLabels,
  conditionLabels,
  type EquipmentFields,
} from "@/lib/equipment-validation";
import { saveEquipmentAction } from "@/app/(app)/equipment/actions";
import type { equipmentOptions } from "@/server/services/equipment";
import { FormPanel } from "@/components/forms/form-panel";
export function EquipmentEditor({
  initialFields,
  id,
  updatedAt,
  options,
  financial,
}: {
  initialFields: EquipmentFields;
  id?: string;
  updatedAt?: string;
  options: Awaited<ReturnType<typeof equipmentOptions>>;
  financial: boolean;
}) {
  const router = useRouter(),
    [reason, setReason] = useState("");
  const form = useForm<EquipmentFields>({
    resolver: zodResolver(equipmentFieldsSchema) as Resolver<EquipmentFields>,
    defaultValues: initialFields,
  });
  const categoryId = useWatch({ control: form.control, name: "categoryId" }),
    status = useWatch({ control: form.control, name: "status" });
  const defs =
    options.categories.find((c) => c.id === categoryId)?.definitions ?? [];
  const nullable = { setValueAs: (v: string) => (v === "" ? null : v) };
  const states = id
    ? [initialFields.status, ...directTransitions[initialFields.status]]
    : (["IN_STOCK", "IN_REPAIR", "LOST", "RETIRED"] as const);
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-8">
      <FormPanel
        form={form}
        onSubmit={async (fields) => {
          const result = await saveEquipmentAction({
            ...(id ? { id, updatedAt } : {}),
            fields,
            reason,
          });
          if (result.id) {
            router.push("/equipment/" + result.id);
            router.refresh();
          }
          return result;
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          {(
            [
              ["name", "Désignation"],
              ["assetTag", "Numéro d’inventaire"],
              ["brand", "Marque"],
              ["model", "Modèle"],
              ["serialNumber", "Numéro de série"],
            ] as const
          ).map(([name, label]) => (
            <label key={name} className="space-y-2 text-sm">
              <span>
                {label}
                {name === "name" ? " *" : ""}
              </span>
              <input
                className="field"
                {...form.register(name, name === "name" ? {} : nullable)}
                placeholder={
                  name === "assetTag" ? "Généré automatiquement" : undefined
                }
              />
              {form.formState.errors[name] && (
                <span role="alert" className="text-xs text-danger">
                  {form.formState.errors[name]?.message}
                </span>
              )}
            </label>
          ))}
          <label className="space-y-2 text-sm">
            <span>Catégorie *</span>
            <select className="field" {...form.register("categoryId")}>
              <option value="">Choisir une catégorie</option>
              {options.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span>Statut</span>
            <select className="field" {...form.register("status")}>
              {states.map((s) => (
                <option key={s} value={s}>
                  {equipmentStatusLabels[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span>État</span>
            <select className="field" {...form.register("condition")}>
              {Object.entries(conditionLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ["supplierId", "Fournisseur", options.suppliers],
              ["locationId", "Site", options.locations],
            ] as const
          ).map(([name, label, items]) => (
            <label key={name} className="space-y-2 text-sm">
              <span>{label}</span>
              <select className="field" {...form.register(name, nullable)}>
                <option value="">Non renseigné</option>
                {items.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {(
            [
              ["purchaseDate", "Date d’achat"],
              ["warrantyEndDate", "Fin de garantie"],
            ] as const
          ).map(([name, label]) => (
            <label key={name} className="space-y-2 text-sm">
              <span>{label}</span>
              <input
                type="date"
                className="field"
                {...form.register(name, nullable)}
              />
            </label>
          ))}
          {financial && (
            <label className="space-y-2 text-sm">
              <span>Prix d’achat HT (€)</span>
              <input
                inputMode="decimal"
                className="field"
                {...form.register("purchasePrice", nullable)}
              />
              {form.formState.errors.purchasePrice && (
                <span role="alert" className="text-xs text-danger">
                  {form.formState.errors.purchasePrice.message}
                </span>
              )}
            </label>
          )}
          <label className="space-y-2 text-sm">
            <span>Durée d’amortissement (mois)</span>
            <input
              type="number"
              min="1"
              max="600"
              className="field"
              {...form.register("depreciationMonths", {
                setValueAs: (v: string | null) =>
                  v === "" || v === null ? null : Number(v),
              })}
            />
          </label>
        </div>
        <fieldset className="space-y-4 border-t pt-5">
          <legend className="pr-3 font-semibold">
            Caractéristiques de la catégorie
          </legend>
          {defs.length ? (
            <div className="grid gap-5 sm:grid-cols-2">
              {defs.map((d) => (
                <label key={d.key} className="space-y-2 text-sm">
                  <span>
                    {d.label}
                    {d.unit ? " (" + d.unit + ")" : ""}
                    {d.disabled ? " · désactivée" : ""}
                  </span>
                  {d.type === "boolean" ? (
                    <select
                      disabled={d.disabled}
                      className="field"
                      {...form.register(`specs.${d.key}` as const, {
                        setValueAs: (v: string) =>
                          v === "" ? undefined : v === "true",
                      })}
                    >
                      <option value="">Non renseigné</option>
                      <option value="true">Oui</option>
                      <option value="false">Non</option>
                    </select>
                  ) : d.type === "choice" ? (
                    <select
                      disabled={d.disabled}
                      className="field"
                      {...form.register(`specs.${d.key}` as const, {
                        setValueAs: (v: string) => v || undefined,
                      })}
                    >
                      <option value="">Non renseigné</option>
                      {d.choices?.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      readOnly={d.disabled}
                      className="field"
                      type={d.type === "number" ? "number" : "text"}
                      step="any"
                      {...form.register(`specs.${d.key}` as const, {
                        setValueAs: (v: string) =>
                          v === ""
                            ? undefined
                            : d.type === "number"
                              ? Number(v)
                              : v,
                      })}
                    />
                  )}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucune caractéristique définie pour cette catégorie.
            </p>
          )}
        </fieldset>
        <label className="block space-y-2 text-sm">
          <span>Notes internes</span>
          <textarea
            rows={3}
            className="field"
            {...form.register("notes", nullable)}
          />
        </label>
        {id && status !== initialFields.status && (
          <label className="block space-y-2 text-sm">
            <span>Motif du changement de statut *</span>
            <textarea
              className="field"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}
        {Object.keys(form.formState.errors).length > 0 && (
          <p role="alert" className="text-sm text-danger">
            Vérifiez les champs obligatoires, les dates et les caractéristiques.
          </p>
        )}
      </FormPanel>
    </section>
  );
}
