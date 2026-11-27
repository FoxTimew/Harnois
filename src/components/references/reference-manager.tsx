"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  referenceFieldsSchema,
  type ReferenceKind,
} from "@/lib/reference-validation";
import { saveReferenceAction } from "@/app/(app)/references/actions";
import { actionMessage } from "@/lib/action-result";
import type { ReferenceRow } from "@/server/services/references";
import { FormPanel } from "@/components/forms/form-panel";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
function ReferenceForm({
  kind,
  row,
  organizations,
}: {
  kind: ReferenceKind;
  row?: ReferenceRow;
  organizations: ReferenceRow[];
}) {
  const router = useRouter();
  const form = useForm<z.infer<typeof referenceFieldsSchema>>({
    resolver: zodResolver(referenceFieldsSchema),
    defaultValues: {
      name: row?.name ?? "",
      organizationId: row?.organizationId ?? null,
      address: row?.address ?? null,
      city: row?.city ?? null,
    },
  });
  const nullable = { setValueAs: (value: string) => value || null };
  return (
    <FormPanel
      form={form}
      onSubmit={async (fields) => {
        const result = await saveReferenceAction({
          kind,
          operation: "save",
          ...(row ? { id: row.id, updatedAt: row.updatedAt } : {}),
          fields,
        });
        if (!result.error) {
          router.refresh();
          if (!row) form.reset();
        }
        return result;
      }}
    >
      <label className="block text-sm">
        Nom *
        <input
          className="field mt-2"
          maxLength={120}
          {...form.register("name")}
        />
        {form.formState.errors.name && (
          <span className="text-xs text-danger">Le nom est obligatoire.</span>
        )}
      </label>
      {kind === "departments" && (
        <label className="block text-sm">
          Organisation *
          <select
            className="field mt-2"
            {...form.register("organizationId", nullable)}
          >
            <option value="">Choisir une organisation</option>
            {organizations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {kind === "locations" && (
        <>
          <label className="block text-sm">
            Adresse
            <input
              className="field mt-2"
              maxLength={240}
              {...form.register("address", nullable)}
            />
          </label>
          <label className="block text-sm">
            Ville
            <input
              className="field mt-2"
              maxLength={120}
              {...form.register("city", nullable)}
            />
          </label>
        </>
      )}
    </FormPanel>
  );
}
export function ReferenceManager({
  kind,
  rows,
  organizations,
  editable,
}: {
  kind: ReferenceKind;
  rows: ReferenceRow[];
  organizations: ReferenceRow[];
  editable: boolean;
}) {
  const router = useRouter(),
    [error, setError] = useState(""),
    [pending, transition] = useTransition();
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rows.length} élément{rows.length > 1 ? "s" : ""} · suppression
          possible uniquement sans rattachement
        </p>
        {editable && (
          <Sheet
            title="Ajouter un élément"
            description="Les champs marqués d’un astérisque sont obligatoires."
            trigger={
              <Button>
                <Plus className="size-4" />
                Ajouter
              </Button>
            }
          >
            <ReferenceForm kind={kind} organizations={organizations} />
          </Sheet>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-danger/10 p-4 text-sm text-danger"
        >
          {error}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((row) => (
          <article
            className="rounded-2xl border bg-card p-6"
            key={row.id + row.updatedAt}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-semibold break-words">{row.name}</h2>
                {row.organizationName && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {row.organizationName}
                  </p>
                )}
                {kind === "locations" && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {[row.address, row.city].filter(Boolean).join(" · ") ||
                      "Adresse non renseignée"}
                  </p>
                )}
              </div>
              {editable && (
                <div className="flex shrink-0 gap-1">
                  <Sheet
                    title="Modifier l’élément"
                    description="Un pôle lié à des employés ne peut pas changer d’organisation."
                    trigger={
                      <Button
                        variant="ghost"
                        aria-label={"Modifier " + row.name}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    }
                  >
                    <ReferenceForm
                      kind={kind}
                      row={row}
                      organizations={organizations}
                    />
                  </Sheet>
                  <ConfirmDialog
                    title="Supprimer ce référentiel ?"
                    description="L’opération sera refusée si des employés, équipements, pôles ou abonnements sont encore rattachés, y compris des historiques."
                    pending={pending}
                    trigger={
                      <Button
                        variant="ghost"
                        aria-label={"Supprimer " + row.name}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    }
                    onConfirm={() =>
                      transition(async () => {
                        const result = await saveReferenceAction({
                          kind,
                          operation: "delete",
                          id: row.id,
                          updatedAt: row.updatedAt,
                        });
                        if (result.error)
                          setError(actionMessage(result.error, result.details));
                        else {
                          setError("");
                          toast.success("Élément supprimé.");
                          router.refresh();
                        }
                      })
                    }
                  />
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
      {!rows.length && (
        <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Aucun élément dans ce référentiel.
        </p>
      )}
    </div>
  );
}
