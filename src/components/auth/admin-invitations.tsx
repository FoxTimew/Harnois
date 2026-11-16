"use client";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { invitationSchema } from "@/lib/validation";
import { authErrorMessage, roleLabels } from "@/lib/auth-messages";
import {
  inviteAction,
  revokeAction,
} from "@/app/(app)/admin/invitations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage } from "./form-message";
export type InvitationSummary = {
  id: string;
  email: string;
  role: keyof typeof roleLabels;
  status: string;
  revocable: boolean;
};
export function AdminInvitations({
  invitations,
  employees,
}: {
  invitations: InvitationSummary[];
  employees: { id: string; firstName: string; lastName: string }[];
}) {
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof invitationSchema>>({
    resolver: zodResolver(invitationSchema),
    defaultValues: { role: "EMPLOYEE" },
  });
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <form
        className="space-y-5 rounded-2xl border bg-card p-6"
        onSubmit={handleSubmit((values) =>
          startTransition(async () => {
            setMessage("");
            setSuccess(false);
            try {
              const result = await inviteAction(values);
              if (result.error) setMessage(authErrorMessage(result.error));
              else {
                setSuccess(true);
                setMessage("Invitation envoyée. Le lien est valable 7 jours.");
                reset();
              }
            } catch {
              setMessage("L’invitation n’a pas pu être envoyée. Réessayez.");
            }
          }),
        )}
      >
        <h2 className="text-lg font-medium">Inviter une personne</h2>
        <div className="space-y-2">
          <label htmlFor="invite-email" className="text-sm">
            Adresse email
          </label>
          <Input
            id="invite-email"
            type="email"
            {...register("email")}
            aria-invalid={Boolean(errors.email)}
          />
          {errors.email && (
            <p className="text-sm text-red-800">Adresse email invalide.</p>
          )}
        </div>
        <div className="space-y-2">
          <label htmlFor="invite-role" className="text-sm">
            Rôle
          </label>
          <select
            id="invite-role"
            className="h-12 w-full rounded-lg border bg-background px-3 text-sm"
            {...register("role")}
          >
            {Object.entries(roleLabels).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="invite-employee" className="text-sm">
            Employé lié{" "}
            <span className="text-muted-foreground">(facultatif)</span>
          </label>
          <select
            id="invite-employee"
            className="h-12 w-full rounded-lg border bg-background px-3 text-sm"
            {...register("employeeId", {
              setValueAs: (value) => value || undefined,
            })}
          >
            <option value="">Aucun</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.firstName} {employee.lastName}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Une nouvelle invitation remplace celle qui est encore en attente pour
          cette adresse.
        </p>
        <FormMessage success={success}>{message}</FormMessage>
        <Button className="w-full" disabled={pending || isSubmitting}>
          Envoyer l’invitation
        </Button>
      </form>
      <section>
        <h2 className="mb-4 text-lg font-medium">Invitations récentes</h2>
        {!invitations.length && (
          <p className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">
            Aucune invitation pour le moment.
          </p>
        )}
        <ul className="space-y-3">
          {invitations.map((invitation) => (
            <li key={invitation.id} className="rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium break-all">
                    {invitation.email}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {roleLabels[invitation.role]}
                  </p>
                </div>
                {invitation.revocable && (
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          const result = await revokeAction(invitation.id);
                          if (result.error) {
                            setSuccess(false);
                            setMessage(authErrorMessage(result.error));
                          }
                        } catch {
                          setSuccess(false);
                          setMessage("La révocation a échoué. Réessayez.");
                        }
                      })
                    }
                  >
                    Révoquer
                  </Button>
                )}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {invitation.status}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          Les 50 dernières invitations sont affichées.
        </p>
      </section>
    </div>
  );
}
