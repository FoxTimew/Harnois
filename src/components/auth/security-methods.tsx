"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Link2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-messages";
import { Button } from "@/components/ui/button";
import { FormMessage } from "./form-message";
import type { ProviderAvailability } from "./provider-buttons";
export function SecurityMethods({
  accounts,
  providers,
}: {
  accounts: { id: string; providerId: string }[];
  providers: ProviderAvailability;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const perform = async (
    action: () => Promise<{ error?: { code?: string } | null }>,
  ) => {
    setMessage("");
    setBusy(true);
    try {
      const result = await action();
      if (result.error) setMessage(authErrorMessage(result.error.code));
      else router.refresh();
    } catch {
      setMessage(authErrorMessage());
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6">
      <FormMessage>{message}</FormMessage>
      <div className="divide-y rounded-2xl border bg-card px-5 sm:px-7">
        {(["credential", "google", "microsoft"] as const).map((provider) => {
          const account = accounts.find((item) => item.providerId === provider);
          const label =
            provider === "credential"
              ? "Email et mot de passe"
              : provider === "google"
                ? "Google"
                : "Microsoft";
          return (
            <div
              key={provider}
              className="flex flex-wrap items-center justify-between gap-4 py-6"
            >
              <div className="flex items-center gap-4">
                <span className="flex size-10 items-center justify-center rounded-xl bg-muted">
                  <KeyRound size={18} />
                </span>
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {account ? "Méthode active" : "Non associé"}
                  </p>
                </div>
              </div>
              {account ? (
                <Button
                  variant="outline"
                  disabled={busy || accounts.length <= 1}
                  onClick={() =>
                    perform(() =>
                      authClient.unlinkAccount({ accountId: account.id }),
                    )
                  }
                >
                  Délier
                </Button>
              ) : provider !== "credential" ? (
                <Button
                  variant="outline"
                  disabled={busy || !providers[provider]}
                  onClick={() =>
                    perform(() =>
                      authClient.linkSocial({
                        provider,
                        callbackURL: "/profile/security",
                      }),
                    )
                  }
                >
                  <Link2 size={15} />
                  Lier {label}
                </Button>
              ) : (
                <Link href="/forgot-password" className="text-xs underline">
                  Définir un mot de passe
                </Link>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        Conservez au moins une méthode de connexion. Pour lier ou délier un
        compte, votre dernière connexion doit dater de moins de 5 minutes.
      </p>
      <Link
        href="/login"
        className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
      >
        Se reconnecter
      </Link>
    </div>
  );
}
