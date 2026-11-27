"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Laptop } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { actionMessage } from "@/lib/action-result";
import { revokeSessionAction } from "@/app/(app)/profile/security/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import type { listSessions } from "@/server/services/sessions";
import { RecentVerification } from "@/components/mfa/verification";
import { mfaRequest, type MfaStatus } from "@/lib/mfa-client";
export function SessionList({
  sessions,
  readOnly = false,
}: {
  sessions: Awaited<ReturnType<typeof listSessions>>;
  readOnly?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [proof, setProof] = useState<MfaStatus | null>(null);
  const router = useRouter();
  function revoke(input: unknown) {
    startTransition(async () => {
      setMessage("");
      try {
        const result = await revokeSessionAction(input);
        if (result.error) {
          setMessage(actionMessage(result.error));
          if (result.error === "REAUTHENTICATION_REQUIRED")
            setProof(await mfaRequest("status"));
        } else if (result.currentRevoked) {
          router.replace("/login");
          router.refresh();
        } else {
          toast.success("Les sessions sélectionnées sont fermées.");
          router.refresh();
        }
      } catch {
        setMessage("La révocation a échoué. Réessayez.");
      }
    });
  }
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      {proof && (
        <div className="mb-6">
          <RecentVerification
            status={proof}
            onVerified={() => {
              setProof(null);
              setMessage("");
              router.refresh();
            }}
          />
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Sessions actives</h2>
        {!readOnly && (
          <ConfirmDialog
            title="Fermer les autres sessions ?"
            description="Vous resterez connecté sur cet appareil. Une vérification récente est nécessaire."
            trigger={
              <Button
                variant="outline"
                disabled={pending || !sessions.some((s) => !s.current)}
              >
                Révoquer les autres sessions
              </Button>
            }
            onConfirm={() => revoke({ operation: "others" })}
          />
        )}
      </div>
      <p className="mb-5 text-xs leading-5 text-muted-foreground">
        L’appareil est estimé à partir du navigateur. L’adresse IP est celle de
        la connexion ; l’activité est actualisée au maximum une fois par minute.
      </p>
      {message && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {message}
        </p>
      )}
      {!sessions.length && (
        <p className="py-6 text-sm text-muted-foreground">
          Aucune session active.
        </p>
      )}
      <ul className="divide-y">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="flex flex-wrap items-start gap-4 py-5"
          >
            <Laptop
              className="mt-1 size-5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium">{session.device}</h3>
                {session.current && (
                  <StatusBadge tone="positive">Cette session</StatusBadge>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                IP : {session.ipAddress ?? "Non renseignée"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Dernière activité : {formatDate(session.lastSeenAt)}
              </p>
            </div>
            {!readOnly && (
              <ConfirmDialog
                title={
                  session.current
                    ? "Fermer votre session actuelle ?"
                    : "Révoquer cette session ?"
                }
                description="L’appareil sera déconnecté. Une vérification récente est nécessaire."
                trigger={
                  <Button variant="ghost" disabled={pending}>
                    Révoquer
                  </Button>
                }
                onConfirm={() =>
                  revoke({ operation: "one", sessionId: session.id })
                }
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
