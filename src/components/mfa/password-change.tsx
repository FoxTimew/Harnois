"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-messages";
import { passwordSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage } from "@/components/auth/form-message";
const schema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
export function PasswordChange() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
  });
  return (
    <section className="space-y-5">
      <h2 className="text-2xl font-semibold">Changer le mot de passe</h2>
      <p className="text-sm leading-6 text-muted-foreground">
        Confirmez votre identité dans la section Double authentification avant
        de modifier votre mot de passe. Les autres sessions seront fermées.
      </p>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          setMessage("");
          setSuccess(false);
          try {
            const result = await authClient.changePassword({
              ...values,
              revokeOtherSessions: true,
            });
            if (result.error) setMessage(authErrorMessage(result.error.code));
            else {
              setSuccess(true);
              setMessage("Votre mot de passe a été modifié.");
              form.reset();
              router.refresh();
            }
          } catch {
            setMessage(authErrorMessage());
          }
        })}
      >
        <label className="text-sm font-medium" htmlFor="current-password">
          Mot de passe actuel
        </label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          {...form.register("currentPassword")}
        />
        <label className="text-sm font-medium" htmlFor="new-password">
          Nouveau mot de passe
        </label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          {...form.register("newPassword")}
        />
        {form.formState.errors.newPassword && (
          <p role="alert" className="text-sm text-red-800">
            Choisissez un mot de passe de 12 à 128 caractères.
          </p>
        )}
        <FormMessage success={success}>{message}</FormMessage>
        <Button disabled={form.formState.isSubmitting}>
          Changer le mot de passe
        </Button>
      </form>
    </section>
  );
}
