"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { KeyRound, Smartphone } from "lucide-react";
import {
  totpCodeSchema,
  recoveryCodeSchema,
  primaryProofSchema,
} from "@/lib/mfa-validation";
import { mfaRequest, mfaMessage, type MfaStatus } from "@/lib/mfa-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage } from "@/components/auth/form-message";
import { SessionControls } from "@/components/auth/session-controls";

export function Verification({
  status,
  onVerified,
}: {
  status: MfaStatus;
  onVerified: () => void | Promise<void>;
}) {
  const [method, setMethod] = useState(status.hasKeys ? "key" : "totp");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const form = useForm<{ code: string }>({
    resolver: zodResolver(
      method === "recovery" ? recoveryCodeSchema : totpCodeSchema,
    ),
  });
  async function verifyKey() {
    setBusy(true);
    setMessage("");
    try {
      const { options, challengeId } = await mfaRequest<{
        options: PublicKeyCredentialRequestOptionsJSON;
        challengeId: string;
      }>("webauthn/authenticate/options", {});
      const response = await startAuthentication({ optionsJSON: options });
      await mfaRequest("webauthn/authenticate/verify", {
        challengeId,
        response,
      });
      await onVerified();
    } catch (error) {
      setMessage(mfaMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <div
        className="flex flex-wrap gap-2"
        aria-label="Méthode de vérification"
      >
        {status.hasKeys && (
          <Button
            variant={method === "key" ? "default" : "outline"}
            disabled={busy}
            onClick={() => {
              setMethod("key");
              setMessage("");
              form.reset();
            }}
          >
            <KeyRound size={16} />
            Clé de sécurité
          </Button>
        )}
        {status.hasTotp && (
          <Button
            variant={method === "totp" ? "default" : "outline"}
            disabled={busy}
            onClick={() => {
              setMethod("totp");
              setMessage("");
              form.reset();
            }}
          >
            <Smartphone size={16} />
            Application
          </Button>
        )}
      </div>
      {method === "key" ? (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Utilisez une clé USB ou NFC, votre téléphone ou l’authentification
            de cet appareil. Votre navigateur vous guidera.
          </p>
          <Button className="w-full" disabled={busy} onClick={verifyKey}>
            {busy ? "Vérification…" : "Utiliser ma clé"}
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(async ({ code }) => {
            setBusy(true);
            setMessage("");
            try {
              await mfaRequest(
                method === "recovery" ? "recovery/verify" : "totp/verify",
                { code },
              );
              form.reset();
              await onVerified();
            } catch (error) {
              setMessage(mfaMessage(error));
            } finally {
              setBusy(false);
            }
          })}
        >
          <label className="block text-sm font-medium" htmlFor="mfa-code">
            {method === "recovery"
              ? "Code de secours"
              : "Code de l’application"}
          </label>
          <Input
            id="mfa-code"
            autoComplete="one-time-code"
            inputMode={method === "recovery" ? "text" : "numeric"}
            placeholder={
              method === "recovery" ? "XXXX-XXXX-XXXX-XXXX" : "000000"
            }
            maxLength={method === "recovery" ? 32 : 6}
            aria-invalid={Boolean(form.formState.errors.code)}
            {...form.register("code")}
          />
          {form.formState.errors.code && (
            <p role="alert" className="text-sm text-red-800">
              {method === "recovery"
                ? "Saisissez les 16 caractères du code de secours."
                : "Saisissez les 6 chiffres du code."}
            </p>
          )}
          <Button className="w-full" disabled={busy}>
            {busy ? "Vérification…" : "Vérifier"}
          </Button>
        </form>
      )}
      <FormMessage>{message}</FormMessage>
      {method !== "recovery" && (
        <button
          className="min-h-11 text-sm underline underline-offset-4"
          disabled={busy}
          onClick={() => {
            setMethod("recovery");
            setMessage("");
            form.reset();
          }}
        >
          Utiliser un code de secours
        </button>
      )}
      {method === "recovery" && (
        <p className="text-sm leading-6 text-muted-foreground">
          Chaque code fonctionne une seule fois. Si vous avez perdu tous vos
          facteurs et codes, contactez votre administrateur.
        </p>
      )}
    </div>
  );
}

export function RecentVerification({
  status,
  onVerified,
}: {
  status: MfaStatus;
  onVerified: () => void | Promise<void>;
}) {
  const form = useForm<{ password: string }>({
    resolver: zodResolver(primaryProofSchema),
  });
  const [message, setMessage] = useState("");
  return (
    <section
      className="space-y-5 rounded-2xl border bg-card p-5 sm:p-7"
      aria-labelledby="recent-heading"
    >
      <h2 id="recent-heading" className="text-xl font-semibold">
        Confirmez votre identité
      </h2>
      <p className="text-sm leading-6 text-muted-foreground">
        Cette action exige une vérification datant de moins de 10 minutes.
      </p>
      {status.hasFactor ? (
        <Verification status={status} onVerified={onVerified} />
      ) : status.hasPassword ? (
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(async (values) => {
            setMessage("");
            try {
              await mfaRequest("primary/confirm", values);
              form.reset();
              await onVerified();
            } catch (error) {
              setMessage(mfaMessage(error));
            }
          })}
        >
          <label className="text-sm font-medium" htmlFor="confirm-password">
            Mot de passe actuel
          </label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="current-password"
            {...form.register("password")}
          />
          <FormMessage>{message}</FormMessage>
          <Button disabled={form.formState.isSubmitting}>
            Confirmer mon identité
          </Button>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-sm leading-6">
            Déconnectez-vous, puis reconnectez-vous avec votre fournisseur pour
            confirmer votre identité.
          </p>
          <SessionControls />
        </div>
      )}
    </section>
  );
}
