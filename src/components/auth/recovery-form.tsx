"use client";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { emailSchema, passwordSchema } from "@/lib/validation";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage } from "./form-message";

const recoverySchema = z.object({ email: emailSchema });
export function RecoveryForm({
  verification = false,
}: {
  verification?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof recoverySchema>>({
    resolver: zodResolver(recoverySchema),
  });
  return (
    <form
      className="space-y-5"
      onSubmit={handleSubmit(async ({ email }) => {
        setMessage("");
        setSuccess(false);
        try {
          const result = verification
            ? await authClient.sendVerificationEmail({
                email,
                callbackURL: "/verify-email?verified=1",
              })
            : await authClient.requestPasswordReset({
                email,
                redirectTo: "/reset-password",
              });
          if (result.error)
            return setMessage(authErrorMessage(result.error.code));
          setSuccess(true);
          setMessage(
            "Si cette adresse correspond à un compte concerné, vous recevrez un email. Pensez à vérifier les courriers indésirables.",
          );
        } catch {
          setMessage(authErrorMessage("EMAIL_DELIVERY_FAILED"));
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
          {...register("email")}
          aria-invalid={Boolean(errors.email)}
        />
        {errors.email && (
          <p className="text-sm text-red-800">
            Renseignez une adresse email valide.
          </p>
        )}
      </div>
      <FormMessage success={success}>{message}</FormMessage>
      <Button className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Envoi…" : "Recevoir un lien"}
      </Button>
      <Link
        href="/login"
        className="block text-center text-sm underline underline-offset-4"
      >
        Revenir à la connexion
      </Link>
    </form>
  );
}
const resetSchema = z.object({ password: passwordSchema });
export function ResetPasswordForm({ token }: { token: string }) {
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
  });
  if (success)
    return (
      <div className="space-y-5">
        <FormMessage success>
          Votre mot de passe a été modifié. Reconnectez-vous sur vos appareils.
        </FormMessage>
        <Link
          href="/login"
          className="block text-center underline underline-offset-4"
        >
          Se connecter
        </Link>
      </div>
    );
  return (
    <form
      className="space-y-5"
      onSubmit={handleSubmit(async ({ password }) => {
        try {
          const result = await authClient.resetPassword({
            token,
            newPassword: password,
          });
          if (result.error)
            return setMessage(authErrorMessage(result.error.code));
          setSuccess(true);
        } catch {
          setMessage(authErrorMessage("INVALID_TOKEN"));
        }
      })}
    >
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium">
          Nouveau mot de passe
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
        {isSubmitting ? "Enregistrement…" : "Enregistrer le mot de passe"}
      </Button>
      <Link
        href="/forgot-password"
        className="block text-center text-sm underline underline-offset-4"
      >
        Demander un nouveau lien
      </Link>
    </form>
  );
}
