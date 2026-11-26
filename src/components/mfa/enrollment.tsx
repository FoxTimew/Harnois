"use client";
import Image from "next/image";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
} from "@simplewebauthn/browser";
import { Smartphone, KeyRound } from "lucide-react";
import { totpCodeSchema, keyNameSchema } from "@/lib/mfa-validation";
import {
  mfaRequest,
  mfaMessage,
  MfaClientError,
  type MfaStatus,
} from "@/lib/mfa-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage } from "@/components/auth/form-message";
import { RecentVerification } from "./verification";
export function Enrollment({
  status,
  onRefresh,
  onComplete,
}: {
  status: MfaStatus;
  onRefresh: () => Promise<void>;
  onComplete: (codes?: string[]) => Promise<void> | void;
}) {
  const [method, setMethod] = useState<"totp" | "key" | null>(null);
  const [secret, setSecret] = useState<{
    secret: string;
    qrCode: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const totp = useForm<{ code: string }>({
    resolver: zodResolver(totpCodeSchema),
  });
  const key = useForm<{ name: string }>({
    resolver: zodResolver(keyNameSchema),
  });
  async function showFailure(error: unknown) {
    setMessage(mfaMessage(error));
    if (
      error instanceof MfaClientError &&
      error.code === "REAUTHENTICATION_REQUIRED"
    ) {
      setSecret(null);
      setMethod(null);
      await onRefresh();
    }
  }
  if (!status.recent)
    return <RecentVerification status={status} onVerified={onRefresh} />;
  async function startTotp() {
    setBusy(true);
    setMessage("");
    try {
      setSecret(await mfaRequest("totp/enroll", {}));
      setMethod("totp");
    } catch (error) {
      await showFailure(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      {!method && (
        <div className="grid gap-3">
          {!status.hasTotp && (
            <button
              className="flex min-h-24 items-center gap-4 rounded-2xl border bg-card p-5 text-left hover:bg-accent disabled:opacity-50"
              disabled={busy}
              onClick={startTotp}
            >
              <Smartphone className="shrink-0" size={24} />
              <span>
                <span className="block font-medium">
                  Application d’authentification
                </span>
                <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                  Un code à 6 chiffres avec Google Authenticator, Authy ou
                  1Password.
                </span>
              </span>
            </button>
          )}
          <button
            className="flex min-h-24 items-center gap-4 rounded-2xl border bg-card p-5 text-left hover:bg-accent disabled:opacity-50"
            disabled={busy}
            onClick={() => {
              setMethod("key");
              setMessage("");
            }}
          >
            <KeyRound className="shrink-0" size={24} />
            <span>
              <span className="block font-medium">
                Clé de sécurité ou téléphone
              </span>
              <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                Clé USB/NFC, téléphone, Windows Hello ou Touch ID.
              </span>
            </span>
          </button>
        </div>
      )}
      {method === "totp" && secret && (
        <form
          className="space-y-5"
          onSubmit={totp.handleSubmit(async (values) => {
            setBusy(true);
            setMessage("");
            try {
              const result = await mfaRequest<{ recoveryCodes?: string[] }>(
                "totp/confirm",
                values,
              );
              setSecret(null);
              totp.reset();
              setMethod(null);
              await onComplete(result.recoveryCodes);
            } catch (error) {
              await showFailure(error);
            } finally {
              setBusy(false);
            }
          })}
        >
          <p className="text-sm leading-6">
            Scannez ce QR code dans votre application, puis saisissez le code
            affiché. Ce QR code est personnel : ne le partagez pas.
          </p>
          <Image
            className="mx-auto max-w-full rounded-xl border"
            src={secret.qrCode}
            width={256}
            height={256}
            unoptimized
            alt="QR code personnel à scanner dans votre application d’authentification"
          />
          <details className="text-sm">
            <summary className="cursor-pointer py-3">
              Saisir la clé manuellement
            </summary>
            <code className="block rounded-lg bg-muted p-3 break-all">
              {secret.secret}
            </code>
          </details>
          <label className="text-sm font-medium" htmlFor="confirm-totp">
            Code à 6 chiffres
          </label>
          <Input
            id="confirm-totp"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            {...totp.register("code")}
          />
          {totp.formState.errors.code && (
            <p className="text-sm text-red-800" role="alert">
              Saisissez les 6 chiffres du code.
            </p>
          )}
          <Button className="w-full" disabled={busy}>
            Activer l’application
          </Button>
        </form>
      )}
      {method === "key" && (
        <form
          className="space-y-4"
          onSubmit={key.handleSubmit(async ({ name }) => {
            setBusy(true);
            setMessage("");
            try {
              const { options, challengeId } = await mfaRequest<{
                options: PublicKeyCredentialCreationOptionsJSON;
                challengeId: string;
              }>("webauthn/register/options", { name });
              const response = await startRegistration({
                optionsJSON: options,
              });
              const result = await mfaRequest<{ recoveryCodes?: string[] }>(
                "webauthn/register/verify",
                { challengeId, response },
              );
              setMethod(null);
              key.reset();
              await onComplete(result.recoveryCodes);
            } catch (error) {
              await showFailure(error);
            } finally {
              setBusy(false);
            }
          })}
        >
          <label className="text-sm font-medium" htmlFor="key-name">
            Nom de la clé
          </label>
          <Input
            id="key-name"
            placeholder="Ma clé principale"
            maxLength={80}
            autoComplete="off"
            {...key.register("name")}
          />
          {key.formState.errors.name && (
            <p role="alert" className="text-sm text-red-800">
              Donnez un nom à cette clé.
            </p>
          )}
          <p className="text-sm leading-6 text-muted-foreground">
            Votre navigateur peut demander un code PIN, une empreinte ou
            proposer un téléphone par QR code. Un PIN peut être nécessaire sur
            une clé qui n’en possède pas encore.
          </p>
          <Button className="w-full" disabled={busy}>
            {busy ? "Enregistrement…" : "Enregistrer la clé"}
          </Button>
        </form>
      )}
      <FormMessage>{message}</FormMessage>
      {method && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setMethod(null);
            setSecret(null);
            setMessage("");
          }}
        >
          Choisir une autre méthode
        </Button>
      )}
    </div>
  );
}
