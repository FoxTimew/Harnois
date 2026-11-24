"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { registrationSchema } from "@/lib/validation";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage } from "./form-message";
import { ProviderButtons, type ProviderAvailability } from "./provider-buttons";

export function InvitationForm({
  token,
  email,
  providers,
}: {
  token: string;
  email: string;
  providers: ProviderAvailability;
}) {
  const [message, setMessage] = useState("");
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof registrationSchema>>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { email },
  });
  async function prepare() {
    const response = await fetch("/api/invitations/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) {
      setMessage(
        authErrorMessage(
          response.status === 429 ? "TOO_MANY_REQUESTS" : "INVITATION_INVALID",
        ),
      );
      return false;
    }
    return true;
  }
  return (
    <div className="space-y-6">
      <p className="rounded-xl bg-accent p-4 text-sm leading-6 break-all">
        Invitation pour <strong>{email}</strong>. Choisissez un compte utilisant
        cette adresse.
      </p>
      <ProviderButtons
        providers={providers}
        prepare={prepare}
        onError={setMessage}
      />
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        ou créez un mot de passe
        <span className="h-px flex-1 bg-border" />
      </div>
      <form
        className="space-y-5"
        onSubmit={handleSubmit(async (values) => {
          setMessage("");
          try {
            if (!(await prepare())) return;
            const result = await authClient.signUp.email(values);
            if (result.error)
              return setMessage(authErrorMessage(result.error.code));
            router.push("/login?registered=1");
          } catch {
            setMessage(authErrorMessage());
          }
        })}
      >
        <input type="hidden" {...register("email")} />
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">
            Votre nom
          </label>
          <Input
            id="name"
            autoComplete="name"
            {...register("name")}
            aria-invalid={Boolean(errors.name)}
          />
          {errors.name && (
            <p className="text-sm text-red-800">{errors.name.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            Choisissez un mot de passe
          </label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register("password")}
            aria-describedby="password-help"
            aria-invalid={Boolean(errors.password)}
          />
          <p id="password-help" className="text-xs text-muted-foreground">
            De 12 à 128 caractères.
          </p>
          {errors.password && (
            <p className="text-sm text-red-800">{errors.password.message}</p>
          )}
        </div>
        <FormMessage>{message}</FormMessage>
        <Button className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Création…" : "Activer mon accès"}
        </Button>
      </form>
    </div>
  );
}
