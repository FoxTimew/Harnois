"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { FormPanel } from "./form-panel";
import { DataTable, type DataColumn } from "@/components/data-table/data-table";
import { Sheet } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatMoney, formatDate } from "@/lib/format";
const schema = z.object({
  label: z
    .string()
    .trim()
    .min(2, "Saisissez au moins deux caractères.")
    .max(80),
});
function DemoForm() {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { label: "" },
  });
  return (
    <FormPanel
      form={form}
      onSubmit={async (data) =>
        data.label.toLowerCase() === "erreur"
          ? { error: "INVALID_REQUEST" }
          : { success: "Démonstration validée. Aucune donnée enregistrée." }
      }
    >
      <label className="block text-sm">
        Libellé
        <input
          className="field mt-2"
          {...form.register("label")}
          aria-invalid={Boolean(form.formState.errors.label)}
          aria-describedby="demo-error"
        />
      </label>
      {form.formState.errors.label && (
        <p id="demo-error" role="alert" className="text-sm text-danger">
          {form.formState.errors.label.message}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Saisissez « erreur » pour afficher une erreur serveur de démonstration.
      </p>
    </FormPanel>
  );
}
type Sample = { id: string; name: string; state: string };
const columns: DataColumn<Sample>[] = [
  { id: "name", label: "Élément", required: true, cell: (row) => row.name },
  {
    id: "state",
    label: "Statut",
    cell: (row) => <StatusBadge tone="positive">{row.state}</StatusBadge>,
  },
];
const rows = [
  { id: "demo-1", name: "Exemple de composant", state: "Disponible" },
  { id: "demo-2", name: "Vue mobile en cartes", state: "Disponible" },
];
const query = {
  page: 1,
  pageSize: 25,
  sort: "name",
  order: "asc" as const,
  columns: "",
};
export function ComponentGallery() {
  return (
    <div className="space-y-10">
      <section className="rounded-2xl border bg-card p-6">
        <h2 className="mb-5 text-xl font-semibold">Actions et retours</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => toast.success("L’action est terminée.")}>
            Afficher une notification
          </Button>
          <Sheet
            title="Formulaire en panneau"
            description="Même validation que le formulaire de page."
            trigger={<Button variant="outline">Ouvrir le panneau</Button>}
          >
            <DemoForm />
          </Sheet>
          <ConfirmDialog
            title="Confirmer l’action ?"
            description="Démonstration : aucune donnée ne sera modifiée."
            trigger={<Button variant="outline">Ouvrir la confirmation</Button>}
            onConfirm={() => toast.success("Action confirmée.")}
          />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <StatusBadge tone="positive">Actif</StatusBadge>
          <StatusBadge tone="warning">En attente</StatusBadge>
          <StatusBadge>Archivé</StatusBadge>
        </div>
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-6">
          <h2 className="mb-5 text-xl font-semibold">Formulaire en page</h2>
          <DemoForm />
        </div>
        <div className="rounded-2xl border bg-card p-6">
          <h2 className="mb-5 text-xl font-semibold">Formats partagés</h2>
          <dl className="space-y-5 text-sm">
            <div>
              <dt className="text-muted-foreground">Montant exact</dt>
              <dd className="mt-2 text-2xl font-semibold">
                {formatMoney("1234567.89")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Date · Europe/Paris</dt>
              <dd className="mt-2">{formatDate("2026-11-27T09:30:00Z")}</dd>
            </div>
          </dl>
        </div>
      </section>
      <section>
        <h2 className="mb-4 text-xl font-semibold">Tableau et cartes</h2>
        <DataTable
          rows={rows}
          total={2}
          query={query}
          columns={columns}
          label="Démonstration"
        />
      </section>
      <section className="grid items-start gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-4 text-xl font-semibold">État vide</h2>
          <DataTable
            rows={[]}
            total={0}
            query={query}
            columns={columns}
            label="Tableau vide"
          />
        </div>
        <div>
          <h2 className="mb-4 text-xl font-semibold">Chargement</h2>
          <TableSkeleton />
        </div>
        <div>
          <h2 className="mb-4 text-xl font-semibold">Erreur</h2>
          <DataTable
            rows={[]}
            total={0}
            query={query}
            columns={columns}
            label="Erreur"
            error="Ce contenu est momentanément indisponible."
          />
        </div>
      </section>
    </div>
  );
}
