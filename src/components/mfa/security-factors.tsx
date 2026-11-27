"use client";
import { useState } from "react";
import { formatDate } from "@/lib/format";
import { mfaRequest, mfaMessage, type MfaStatus } from "@/lib/mfa-client";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/auth/form-message";
import { Enrollment } from "./enrollment";
import { RecentVerification } from "./verification";
import { RecoveryCodes } from "./recovery-codes";
function date(value: Date | string | null) {
  return value ? formatDate(value, false) : "Jamais";
}
export function SecurityFactors({
  initial,
  onRecent,
}: {
  initial: MfaStatus;
  onRecent?: () => void;
}) {
  const [status, setStatus] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [confirm, setConfirm] = useState<
    { kind: "TOTP" | "WEBAUTHN"; id: string } | "codes" | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function refresh() {
    setStatus(await mfaRequest<MfaStatus>("status"));
    onRecent?.();
  }
  if (codes)
    return (
      <RecoveryCodes
        codes={codes}
        onDone={() => {
          setCodes(null);
          void refresh();
        }}
      />
    );
  const factors = [
    ...(status.totp
      ? [
          {
            ...status.totp,
            name: "Application d’authentification",
            kind: "TOTP" as const,
          },
        ]
      : []),
    ...status.keys.map((key) => ({ ...key, kind: "WEBAUTHN" as const })),
  ];
  return (
    <section className="space-y-6" aria-labelledby="factors-heading">
      <div>
        <h2 id="factors-heading" className="text-2xl font-semibold">
          Double authentification
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {status.mandatory
            ? "Elle est obligatoire pour votre compte. Conservez toujours au moins un facteur."
            : "Protégez votre compte avec un second facteur à chaque connexion."}
        </p>
      </div>
      {!status.recent && (
        <RecentVerification status={status} onVerified={refresh} />
      )}
      <div className="divide-y rounded-2xl border bg-card px-5 sm:px-7">
        {factors.length ? (
          factors.map((factor) => (
            <div
              key={factor.id}
              className="flex flex-wrap items-center justify-between gap-3 py-5"
            >
              <div className="min-w-0">
                <p className="font-medium break-words">{factor.name}</p>
                <p className="mt-1 text-xs leading-6 text-muted-foreground">
                  Ajout : {date(factor.createdAt)} · Dernière utilisation :{" "}
                  {date(factor.lastUsedAt)}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={
                  !status.recent ||
                  busy ||
                  (status.mandatory && factors.length === 1)
                }
                onClick={() => setConfirm({ kind: factor.kind, id: factor.id })}
              >
                Supprimer
              </Button>
            </div>
          ))
        ) : (
          <p className="py-6 text-sm text-muted-foreground">
            Aucun second facteur configuré.
          </p>
        )}
      </div>
      {confirm && (
        <div className="space-y-4 rounded-xl border bg-accent p-5">
          <p className="text-sm leading-6">
            {confirm === "codes"
              ? "Les anciens codes de secours ne fonctionneront plus. Conservez les nouveaux codes après cette opération."
              : factors.length === 1
                ? "La suppression de votre dernier facteur désactive la double authentification volontaire et invalide vos codes de secours."
                : "Supprimer ce facteur de votre compte ?"}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy || !status.recent}
              onClick={async () => {
                setBusy(true);
                setMessage("");
                try {
                  if (confirm === "codes") {
                    const result = await mfaRequest<{
                      recoveryCodes: string[];
                    }>("recovery/regenerate", {});
                    setCodes(result.recoveryCodes);
                  } else await mfaRequest("factors/remove", confirm);
                  setConfirm(null);
                  await refresh();
                } catch (error) {
                  setMessage(mfaMessage(error));
                  await refresh();
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirmer
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}
      <FormMessage>{message}</FormMessage>
      {adding ? (
        <div className="space-y-5 rounded-2xl border p-5 sm:p-7">
          <h3 className="font-semibold">Ajouter un facteur</h3>
          <Enrollment
            status={status}
            onRefresh={refresh}
            onComplete={async (nextCodes) => {
              setAdding(false);
              if (nextCodes) setCodes(nextCodes);
              await refresh();
            }}
          />
          <Button variant="outline" onClick={() => setAdding(false)}>
            Fermer
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          disabled={!status.recent || busy}
          onClick={() => setAdding(true)}
        >
          Ajouter un facteur
        </Button>
      )}
      {status.hasFactor && (
        <div className="space-y-4 rounded-2xl border bg-card p-5 sm:p-7">
          <h3 className="font-semibold">Codes de secours</h3>
          <p className="text-sm">{status.remaining} code(s) disponible(s).</p>
          {status.remaining <= 3 && (
            <p role="status" className="text-sm leading-6 text-warning">
              Il vous reste peu de codes. Régénérez-les et conservez-les dans un
              endroit sûr.
            </p>
          )}
          <Button
            variant="outline"
            disabled={!status.recent || busy}
            onClick={() => setConfirm("codes")}
          >
            Régénérer les codes
          </Button>
        </div>
      )}
    </section>
  );
}
