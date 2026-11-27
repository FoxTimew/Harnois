"use client";
import { useState } from "react";
import Link from "next/link";
import { Upload, FileCheck, AlertCircle } from "lucide-react";
import type { EquipmentImportPreview } from "@/server/services/equipment-import";
import { Button, buttonVariants } from "@/components/ui/button";
const steps = [
  "Modèle",
  "Fichier",
  "Lecture",
  "Aperçu",
  "Référentiels",
  "Confirmation",
  "Bilan",
];
export function EquipmentImport() {
  const [file, setFile] = useState<File | null>(null),
    [encoding, setEncoding] = useState("auto"),
    [preview, setPreview] = useState<EquipmentImportPreview | null>(null),
    [approved, setApproved] = useState<string[]>([]);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [result, setResult] = useState<{
      created: number;
      updated: number;
      unchanged: number;
    } | null>(null);
  const step = result
    ? 6
    : preview
      ? preview.hasErrors
        ? 3
        : approved.length !== preview.references.length
          ? 4
          : 5
      : file
        ? 2
        : 1;
  async function send(confirm: boolean) {
    if (!file) return;
    setPending(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set(
        "metadata",
        JSON.stringify(
          confirm && preview
            ? {
                previewId: preview.previewId,
                options: preview.options,
                approvedReferences: approved,
              }
            : { encoding },
        ),
      );
      const response = await fetch(
        "/api/equipment/import/" + (confirm ? "confirm" : "preview"),
        { method: "POST", body: form },
      );
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Import impossible.");
        return;
      }
      if (confirm) {
        setResult(body);
        setPreview(null);
        setFile(null);
      } else {
        setPreview(body);
        setApproved([]);
        setConfirmed(false);
      }
    } catch {
      setError("La lecture du fichier a échoué. Réessayez.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-6">
      <ol
        className="flex gap-2 overflow-x-auto pb-2"
        aria-label="Étapes de l’import"
      >
        {steps.map((s, i) => (
          <li
            key={s}
            aria-current={step === i ? "step" : undefined}
            className={
              "shrink-0 rounded-full px-3 py-2 text-xs " +
              (i === step
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground")
            }
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      {!result && (
        <section className="rounded-2xl border bg-card p-5 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Préparer le fichier</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                CSV UTF-8 ou Excel Windows · 2 Mio · 1 000 lignes maximum. Le
                numéro d’inventaire identifie une mise à jour ; vide, il crée un
                équipement.
              </p>
            </div>
            <a
              className={buttonVariants({ variant: "outline" })}
              download
              href="/api/equipment/import/template"
            >
              Télécharger le modèle
            </a>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Une cellule vide conserve la valeur existante. Utilisez __CLEAR__
            pour l’effacer. Catégories : Parent &gt; Enfant. Prix français
            accepté. Les sites doivent déjà exister.
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-[1fr_14rem]">
            <label className="block text-sm">
              Fichier CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="field mt-2"
                disabled={pending}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setPreview(null);
                  setError("");
                }}
              />
            </label>
            <label className="block text-sm">
              Encodage
              <select
                className="field mt-2"
                value={encoding}
                onChange={(e) => {
                  setEncoding(e.target.value);
                  setPreview(null);
                }}
              >
                <option value="auto">Détection automatique</option>
                <option value="utf-8">UTF-8</option>
                <option value="windows-1252">Windows-1252 (Excel)</option>
              </select>
            </label>
          </div>
          <Button
            className="mt-5"
            disabled={!file || pending}
            onClick={() => void send(false)}
          >
            <Upload size={16} />
            {pending ? "Lecture…" : "Analyser le fichier"}
          </Button>
        </section>
      )}
      {preview && (
        <>
          <section className="overflow-hidden rounded-2xl border bg-card">
            <div className="border-b p-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                {preview.hasErrors ? (
                  <AlertCircle size={20} />
                ) : (
                  <FileCheck size={20} />
                )}
                Aperçu de l’import
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {preview.totals.created} création(s), {preview.totals.updated}{" "}
                modification(s), {preview.totals.unchanged} inchangée(s) ·{" "}
                {preview.encoding}
              </p>
              {preview.hasErrors && (
                <p role="alert" className="mt-3 text-sm text-danger">
                  Aucune donnée n’a été importée. Corrigez toutes les erreurs et
                  analysez à nouveau le fichier.
                </p>
              )}
            </div>
            <div className="divide-y sm:hidden">
              {preview.rows.map((row) => (
                <article key={row.line} className="space-y-2 p-5 text-sm">
                  <p className="text-xs text-muted-foreground">
                    Ligne {row.line} · {row.assetTag}
                  </p>
                  <h3 className="font-semibold">{row.name}</h3>
                  <p>{row.status}</p>
                  {row.errors.length ? (
                    <ul className="space-y-2 text-danger">
                      {row.errors.map((error, index) => (
                        <li key={index}>
                          {error.field} : {error.message}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      {row.operation === "create"
                        ? "À créer"
                        : row.operation === "update"
                          ? "À modifier"
                          : "Inchangé"}
                    </p>
                  )}
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {[
                      "Ligne",
                      "Inventaire",
                      "Désignation",
                      "Statut",
                      "Résultat",
                    ].map((h) => (
                      <th key={h} className="p-4 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.line} className="border-t">
                      <td className="p-4">{r.line}</td>
                      <td className="p-4">{r.assetTag}</td>
                      <td className="p-4 font-medium">{r.name}</td>
                      <td className="p-4">{r.status}</td>
                      <td className="p-4">
                        {r.errors.length ? (
                          <ul className="space-y-1 text-danger">
                            {r.errors.map((e, i) => (
                              <li key={i}>
                                {e.field} : {e.message}
                              </li>
                            ))}
                          </ul>
                        ) : r.operation === "create" ? (
                          "À créer"
                        ) : r.operation === "update" ? (
                          "À modifier"
                        ) : (
                          "Inchangé"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {preview.references.length > 0 && (
            <section className="rounded-2xl border bg-card p-5">
              <h2 className="mb-4 font-semibold">Référentiels proposés</h2>
              <div className="space-y-3">
                {preview.references.map((r) => (
                  <label className="flex items-start gap-3 text-sm" key={r.id}>
                    <input
                      type="checkbox"
                      checked={approved.includes(r.id)}
                      onChange={(e) =>
                        setApproved((a) =>
                          e.target.checked
                            ? [...a, r.id]
                            : a.filter((id) => id !== r.id),
                        )
                      }
                    />
                    <span>
                      Créer{" "}
                      {r.kind === "category"
                        ? "la catégorie"
                        : "le fournisseur"}{" "}
                      « {r.name} »
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}
          {!preview.hasErrors && (
            <section className="rounded-2xl border bg-card p-5">
              <p className="mb-4 text-sm text-muted-foreground">
                L’aperçu expire après 15 minutes. Toute modification du fichier
                ou des données impose une nouvelle analyse. L’import est
                appliqué en une seule transaction.
              </p>
              <label className="mb-5 flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>
                  Je confirme les créations, modifications et assignations
                  affichées.
                </span>
              </label>
              <Button
                disabled={
                  pending ||
                  !confirmed ||
                  approved.length !== preview.references.length
                }
                onClick={() => void send(true)}
              >
                Confirmer l’import
              </Button>
            </section>
          )}
        </>
      )}
      {result && (
        <section className="rounded-2xl border bg-card p-8">
          <FileCheck size={32} className="mb-4 text-primary" />
          <h2 className="text-xl font-semibold">Import terminé</h2>
          <p className="my-4 text-sm">
            {result.created} équipement(s) créé(s), {result.updated} modifié(s),{" "}
            {result.unchanged} inchangé(s).
          </p>
          <Link className={buttonVariants()} href="/equipment">
            Voir les équipements
          </Link>
        </section>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-danger/10 p-4 text-sm text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}
