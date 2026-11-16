"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-messages";

export type ProviderAvailability = { google: boolean; microsoft: boolean };
export function ProviderButtons({
  providers,
  prepare,
  onError,
}: {
  providers: ProviderAvailability;
  prepare?: () => Promise<boolean>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function signIn(provider: "google" | "microsoft") {
    setBusy(true);
    try {
      if (prepare && !(await prepare())) return;
      const result = await authClient.signIn.social({
        provider,
        callbackURL: "/profile/security",
        errorCallbackURL: "/login",
      });
      if (result.error) onError(authErrorMessage(result.error.code));
    } catch {
      onError(authErrorMessage());
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Button
        type="button"
        variant="outline"
        disabled={busy || !providers.google}
        onClick={() => signIn("google")}
        title={providers.google ? undefined : "Connexion Google indisponible"}
      >
        <span className="text-lg font-bold" aria-hidden="true">
          G
        </span>{" "}
        Google
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={busy || !providers.microsoft}
        onClick={() => signIn("microsoft")}
        title={
          providers.microsoft ? undefined : "Connexion Microsoft indisponible"
        }
      >
        <span className="grid grid-cols-2 gap-0.5" aria-hidden="true">
          {[0, 1, 2, 3].map((n) => (
            <span key={n} className="size-1.5 bg-current" />
          ))}
        </span>{" "}
        Microsoft
      </Button>
    </div>
  );
}
