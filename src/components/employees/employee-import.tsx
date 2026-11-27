"use client";
import { useState } from "react";
import Link from "next/link";
import { FileUp, AlertCircle, CheckCircle2, Download } from "lucide-react";
import type { EmployeeImportPreview } from "@/server/services/employee-import";
import { RecentVerification } from "@/components/mfa/verification";
import { mfaRequest, type MfaStatus } from "@/lib/mfa-client";
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
export function EmployeeImport({
  admin,
  initialMfa,
}: {
  admin: boolean;
  initialMfa: MfaStatus;
}) {
  const [file, setFile] = useState<File | null>(null),
    [encoding, setEncoding] = useState("auto");
  const [preview, setPreview] = useState<EmployeeImportPreview | null>(null);
  const [approved, setApproved] = useState<string[]>([]),
    [immediate, setImmediate] = useState(false),
    [deactivate, setDeactivate] = useState(false);
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [mfa, setMfa] = useState(initialMfa);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    unchanged: number;
  } | null>(null);
  const step = result
    ? 6
    : preview
      ? preview.hasErrors
        ? 3
        : preview.references.length &&
            approved.length !== preview.references.length
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
                immediateDepartureConfirmed: immediate,
                deactivateAccount: deactivate,
              }
            : { encoding },
        ),
      );
      const response = await fetch(
        "/api/employees/import/" + (confirm ? "confirm" : "preview"),
        { method: "POST", body: form },
      );
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Import impossible. Réessayez.");
        if (body.code === "REAUTHENTICATION_REQUIRED")
          setMfa((current) => ({ ...current, recent: false }));
        return;
      }
      if (confirm) {
        setResult(body);
        setPreview(null);
        setFile(null);
      } else {
        setPreview(body);
        setApproved([]);
        setImmediate(false);
        setDeactivate(false);
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
        className="flex gap-3 overflow-x-auto pb-2"
        aria-label="Étapes de l’import"
      >
        {steps.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? "step" : undefined}
            className={`flex shrink-0 items-center gap-2 text-xs ${index === step ? "font-semibold text-foreground" : "text-muted-foreground"}`}
          >
            <span
              className={`grid size-7 place-items-center rounded-full ${index === step ? "bg-primary text-primary-foreground" : "bg-muted"}`}
            >
              {index + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>
      {result ? (
        <section className="rounded-2xl border bg-card p-8">
          <CheckCircle2 className="mb-4 size-8 text-success" />
          <h2 className="text-xl font-semibold">Import terminé</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {result.created} création(s), {result.updated} mise(s) à jour,{" "}
            {result.unchanged} fiche(s) inchangée(s).
          </p>
          <Link
            href="/employees"
            className={buttonVariants({ className: "mt-6" })}
          >
            Voir les employés
          </Link>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border bg-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">
                  Préparer votre fichier
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  CSV avec ; ou , · UTF-8 ou Windows-1252 · 2 Mio et 1 000
                  lignes maximum. Email, prénom et nom sont obligatoires. Une
                  cellule vide conserve la valeur existante ; __CLEAR__ efface
                  un champ facultatif.
                </p>
              </div>
              <a
                href="/api/employees/import/template"
                className={buttonVariants({ variant: "outline" })}
              >
                <Download className="size-4" />
                Modèle CSV
              </a>
            </div>
            <div className="mt-6 grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_14rem_auto]">
              <label className="block min-w-0 text-sm">
                Fichier CSV
                <input
                  className="mt-2 block w-full min-w-0 rounded-xl border p-3 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-2"
                  type="file"
                  accept=".csv,text/csv"
                  disabled={pending}
                  onChange={(event) => {
                    setPreview(null);
                    setError("");
                    const candidate = event.target.files?.[0] ?? null;
                    if (candidate && candidate.size > 2 * 1024 * 1024) {
                      setFile(null);
                      setError("Le fichier dépasse 2 Mio.");
                    } else setFile(candidate);
                  }}
                />
              </label>
              <label className="block text-sm">
                Encodage
                <select
                  className="field mt-2"
                  value={encoding}
                  disabled={pending}
                  onChange={(event) => {
                    setEncoding(event.target.value);
                    setPreview(null);
                  }}
                >
                  <option value="auto">Détection automatique</option>
                  <option value="utf-8">UTF-8</option>
                  <option value="windows-1252">Windows-1252 (Excel)</option>
                </select>
              </label>
              <Button
                disabled={!file || pending}
                onClick={() => void send(false)}
              >
                <FileUp className="size-4" />
                {pending ? "Traitement…" : "Afficher l’aperçu"}
              </Button>
            </div>
          </section>
          {preview && (
            <>
              <section className="overflow-hidden rounded-2xl border bg-card">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b p-6">
                  <div>
                    <h2 className="text-lg font-semibold">
                      Aperçu de l’import
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {preview.totals.created} création(s) ·{" "}
                      {preview.totals.updated} mise(s) à jour ·{" "}
                      {preview.totals.unchanged} inchangée(s)
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {preview.encoding} · séparateur {preview.delimiter} ·
                      aperçu valable 15 minutes
                    </p>
                  </div>
                  {preview.hasErrors && (
                    <p
                      role="alert"
                      className="flex items-center gap-2 text-sm font-medium text-danger"
                    >
                      <AlertCircle className="size-4" />
                      {
                        preview.rows.filter((row) => row.errors.length).length
                      }{" "}
                      ligne(s) à corriger. Rien ne sera importé.
                    </p>
                  )}
                </div>
                <div className="hidden max-h-[36rem] overflow-auto md:block">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">
                      Aperçu des employés à importer
                    </caption>
                    <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                      <tr>
                        {[
                          "Ligne",
                          "Employé",
                          "Statut",
                          "Action",
                          "Contrôle",
                        ].map((label) => (
                          <th className="px-5 py-3" key={label}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {preview.rows.map((row) => (
                        <tr
                          key={row.line}
                          className={row.errors.length ? "bg-danger/5" : ""}
                        >
                          <td className="px-5 py-4">{row.line}</td>
                          <td className="max-w-64 px-5 py-4 break-words">
                            <p className="font-medium">
                              {row.firstName} {row.lastName}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {row.email}
                            </p>
                          </td>
                          <td className="px-5 py-4">{row.status}</td>
                          <td className="px-5 py-4">
                            {
                              {
                                create: "Création",
                                update: "Mise à jour",
                                unchanged: "Inchangé",
                              }[row.operation]
                            }
                          </td>
                          <td className="max-w-80 px-5 py-4">
                            {row.errors.length ? (
                              <ul className="space-y-1 text-xs text-danger">
                                {row.errors.map((issue, index) => (
                                  <li key={index}>
                                    <strong>{issue.field}</strong> :{" "}
                                    {issue.message}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-xs text-success">
                                Valide
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="max-h-[36rem] divide-y overflow-y-auto md:hidden">
                  {preview.rows.map((row) => (
                    <article
                      key={row.line}
                      className={`p-5 ${row.errors.length ? "bg-danger/5" : ""}`}
                    >
                      <p className="text-xs text-muted-foreground">
                        Ligne {row.line} · {row.status} ·{" "}
                        {
                          {
                            create: "Création",
                            update: "Mise à jour",
                            unchanged: "Inchangé",
                          }[row.operation]
                        }
                      </p>
                      <p className="mt-2 font-medium">
                        {row.firstName} {row.lastName}
                      </p>
                      <p className="mt-1 text-xs break-all">{row.email}</p>
                      {row.errors.map((issue, index) => (
                        <p className="mt-2 text-xs text-danger" key={index}>
                          <strong>{issue.field}</strong> : {issue.message}
                        </p>
                      ))}
                    </article>
                  ))}
                </div>
              </section>
              {preview.references.length > 0 && (
                <section className="rounded-2xl border bg-card p-6">
                  <h2 className="font-semibold">Référentiels à créer</h2>
                  <p className="mt-2 mb-4 text-sm text-muted-foreground">
                    Confirmez chaque création. Les sites inconnus doivent être
                    créés séparément avant de relire le fichier.
                  </p>
                  <div className="space-y-3">
                    {preview.references.map((ref) => (
                      <label
                        key={ref.id}
                        className="flex items-center gap-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={approved.includes(ref.id)}
                          onChange={(event) =>
                            setApproved((current) =>
                              event.target.checked
                                ? [...current, ref.id]
                                : current.filter((id) => id !== ref.id),
                            )
                          }
                        />
                        {ref.kind === "organizations" ? "Organisation" : "Pôle"}{" "}
                        : {ref.name}
                        {ref.organizationName
                          ? " (" + ref.organizationName + ")"
                          : ""}
                      </label>
                    ))}
                  </div>
                </section>
              )}
              {!preview.hasErrors && (
                <section className="space-y-4 rounded-2xl border bg-card p-6">
                  <h2 className="font-semibold">Confirmer l’import</h2>
                  <p className="text-sm text-muted-foreground">
                    Toutes les lignes sont enregistrées ensemble. Si le fichier
                    ou les données ont changé, un nouvel aperçu sera demandé.
                  </p>
                  {preview.immediateDepartures > 0 && (
                    <label className="flex items-start gap-3 rounded-lg bg-warning/10 p-4 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={immediate}
                        onChange={(event) => setImmediate(event.target.checked)}
                      />
                      Départ immédiat, sans phase de préparation —{" "}
                      {preview.immediateDepartures} personne(s).
                    </label>
                  )}
                  {preview.activeLinkedDepartures > 0 && (
                    <div className="rounded-lg bg-warning/10 p-4 text-sm">
                      <p>
                        {preview.activeLinkedDepartures} compte(s) lié(s) à des
                        personnes parties restent actifs.
                      </p>
                      {admin ? (
                        <label className="mt-3 flex items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={deactivate}
                            onChange={(event) =>
                              setDeactivate(event.target.checked)
                            }
                          />
                          Désactiver ces comptes et fermer leurs sessions dans
                          le même import.
                        </label>
                      ) : (
                        <p className="mt-2">
                          Un administrateur devra désactiver ces comptes.
                        </p>
                      )}
                    </div>
                  )}
                  {preview.reentries > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {preview.reentries} retour(s) en arrivée : vérification
                      récente nécessaire, sans réactivation du compte.
                    </p>
                  )}
                  {(deactivate || preview.reentries > 0) && !mfa.recent && (
                    <RecentVerification
                      status={mfa}
                      onVerified={async () =>
                        setMfa(await mfaRequest("status"))
                      }
                    />
                  )}
                  <Button
                    disabled={
                      pending ||
                      approved.length !== preview.references.length ||
                      (preview.immediateDepartures > 0 && !immediate) ||
                      ((deactivate || preview.reentries > 0) && !mfa.recent)
                    }
                    onClick={() => void send(true)}
                  >
                    {pending ? "Import en cours…" : "Confirmer l’import"}
                  </Button>
                </section>
              )}
            </>
          )}
        </>
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
