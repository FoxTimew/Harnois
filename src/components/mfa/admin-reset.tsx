"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { emailSchema } from "@/lib/validation";
import { mfaRequest, mfaMessage, type MfaStatus } from "@/lib/mfa-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage } from "@/components/auth/form-message";
import { RecentVerification } from "./verification";
const schema = z.object({
  email: emailSchema,
  confirmed: z.boolean().refine(Boolean),
});
export function AdminReset({
  initial,
  targetEmail = "",
}: {
  initial: MfaStatus;
  targetEmail?: string;
}) {
  const [status, setStatus] = useState(initial);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: targetEmail, confirmed: false },
  });
  return (
    <div className="space-y-6">
      {!status.recent && (
        <RecentVerification
          status={status}
          onVerified={async () => setStatus(await mfaRequest("status"))}
        />
      )}
      <form
        className="space-y-5"
        onSubmit={form.handleSubmit(async (values) => {
          setMessage("");
          setSuccess(false);
          try {
            await mfaRequest("admin/reset", values);
            setSuccess(true);
            setMessage(
              "Double authentification réinitialisée. Toutes les sessions de cet utilisateur sont fermées.",
            );
            form.reset();
          } catch (error) {
            setMessage(mfaMessage(error));
            setStatus(await mfaRequest("status"));
          }
        })}
      >
        <label className="text-sm font-medium" htmlFor="reset-email">
          Adresse email de l’utilisateur
        </label>
        <Input
          id="reset-email"
          type="email"
          autoComplete="off"
          readOnly={Boolean(targetEmail)}
          {...form.register("email")}
        />
        {form.formState.errors.email && (
          <p role="alert" className="text-sm text-danger">
            Renseignez une adresse email valide.
          </p>
        )}
        <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
          <input
            className="mt-1 size-4 shrink-0"
            type="checkbox"
            {...form.register("confirmed")}
          />
          Je confirme l’identité de cette personne et la suppression de ses
          facteurs, de ses codes de secours et de toutes ses sessions.
        </label>
        {form.formState.errors.confirmed && (
          <p role="alert" className="text-sm text-danger">
            La confirmation est obligatoire.
          </p>
        )}
        <FormMessage success={success}>{message}</FormMessage>
        <Button disabled={!status.recent || form.formState.isSubmitting}>
          Réinitialiser la double authentification
        </Button>
      </form>
    </div>
  );
}
