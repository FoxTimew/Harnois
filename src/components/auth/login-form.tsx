"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { loginSchema } from "@/lib/validation";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage } from "./form-message";
import { ProviderButtons, type ProviderAvailability } from "./provider-buttons";

export function LoginForm({
  providers,
  error,
  registered,
}: {
  providers: ProviderAvailability;
  error?: string;
  registered?: boolean;
}) {
  const [message, setMessage] = useState(error ? authErrorMessage(error) : "");
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });
  return (
    <div className="space-y-6">
      <FormMessage success>
        {registered
          ? "Votre compte est prêt. Connectez-vous pour accéder à Harnois."
          : null}
      </FormMessage>
      <ProviderButtons providers={providers} onError={setMessage} />
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        ou avec votre email
        <span className="h-px flex-1 bg-border" />
      </div>
      <form
        className="space-y-5"
        onSubmit={handleSubmit(async (values) => {
          setMessage("");
          try {
            const result = await authClient.signIn.email(values);
            if (result.error)
              return setMessage(authErrorMessage(result.error.code));
            router.push("/profile/security");
            router.refresh();
          } catch {
            setMessage(authErrorMessage());
          }
        })}
      >
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            Adresse email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="vous@organisation.fr"
            {...register("email")}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
          {errors.email && (
            <p id="email-error" className="text-sm text-danger">
              Renseignez une adresse email valide.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="password" className="text-sm font-medium">
              Mot de passe
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Mot de passe oublié ?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register("password")}
            aria-invalid={Boolean(errors.password)}
          />
          {errors.password && (
            <p className="text-sm text-danger">
              Renseignez votre mot de passe.
            </p>
          )}
        </div>
        <FormMessage>{message}</FormMessage>
        <Button className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Connexion…" : "Se connecter"}
        </Button>
      </form>
      <p className="text-center text-xs leading-6 text-muted-foreground">
        L’accès à Harnois se fait uniquement sur invitation.
        <br />
        Besoin d’un accès ? Contactez votre administrateur.
      </p>
      <Link
        href="/verify-email"
        className="block text-center text-xs text-muted-foreground underline underline-offset-4"
      >
        Renvoyer un email de vérification
      </Link>
    </div>
  );
}
