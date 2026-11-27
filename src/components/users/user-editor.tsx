"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { roleSchema } from "@/lib/admin-validation";
import { actionMessage } from "@/lib/action-result";
import { roleLabels } from "@/lib/auth-messages";
import { updateUserAction } from "@/app/(app)/admin/users/actions";
import { FormPanel } from "@/components/forms/form-panel";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { RecentVerification } from "@/components/mfa/verification";
import { mfaRequest, type MfaStatus } from "@/lib/mfa-client";
import type { userDetail } from "@/server/services/users";
const roleFormSchema = z.object({ role: roleSchema });
const employeeFormSchema = z.object({ employeeId: z.string().max(128) });
export function UserEditor({
  target,
  own,
  initial,
}: {
  target: Awaited<ReturnType<typeof userDetail>>;
  own: boolean;
  initial: MfaStatus;
}) {
  const [status, setStatus] = useState(initial);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const roleForm = useForm<z.infer<typeof roleFormSchema>>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: { role: target.role },
  });
  const employeeForm = useForm<z.infer<typeof employeeFormSchema>>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: { employeeId: target.employeeId ?? "" },
  });
  async function update(values: Parameters<typeof updateUserAction>[0]) {
    const result = await updateUserAction(values);
    if (result.error === "REAUTHENTICATION_REQUIRED")
      setStatus((current) => ({ ...current, recent: false }));
    if (!result.error) router.refresh();
    return result;
  }
  function command(operation: "active" | "revoke-sessions") {
    startTransition(async () => {
      setMessage("");
      const result = await update({
        operation,
        userId: target.id,
        ...(operation === "active" ? { isActive: !target.isActive } : {}),
      });
      if (result.error) setMessage(actionMessage(result.error));
      else
        toast.success(
          operation === "active"
            ? "Statut mis à jour."
            : "Toutes les sessions ont été révoquées.",
        );
    });
  }
  return (
    <div className="space-y-6">
      {!status.recent && (
        <div className="rounded-2xl border bg-card p-6">
          <RecentVerification
            status={status}
            onVerified={async () => {
              setStatus(await mfaRequest("status"));
              router.refresh();
            }}
          />
        </div>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-6">
          <h2 className="mb-5 text-lg font-semibold">Rôle et accès</h2>
          <FormPanel
            form={roleForm}
            submitLabel="Enregistrer le rôle"
            disabled={own || !status.recent}
            onSubmit={(data) =>
              update({ operation: "role", userId: target.id, ...data })
            }
          >
            <label className="block text-sm">
              Rôle
              <select
                className="field mt-2"
                disabled={own || !status.recent}
                {...roleForm.register("role")}
              >
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {own && (
              <p className="text-xs leading-5 text-muted-foreground">
                Vous ne pouvez pas modifier votre propre rôle.
              </p>
            )}
          </FormPanel>
        </section>
        <section className="rounded-2xl border bg-card p-6">
          <h2 className="mb-5 text-lg font-semibold">Employé lié</h2>
          <FormPanel
            form={employeeForm}
            submitLabel="Enregistrer le lien"
            disabled={!status.recent}
            onSubmit={(data) =>
              update({
                operation: "employee",
                userId: target.id,
                employeeId: data.employeeId || null,
              })
            }
          >
            <label className="block text-sm">
              Fiche employé
              <select
                className="field mt-2"
                disabled={!status.recent}
                {...employeeForm.register("employeeId")}
              >
                <option value="">Aucun employé lié</option>
                {target.employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.firstName} {employee.lastName}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs leading-5 text-muted-foreground">
              Le lien associe la fiche professionnelle à ce compte.
              {target.employeeId && (
                <Link
                  className="ml-1 underline"
                  href={"/employees/" + target.employeeId}
                >
                  Ouvrir la fiche employé
                </Link>
              )}
            </p>
          </FormPanel>
        </section>
      </div>
      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-lg font-semibold">Contrôle du compte</h2>
        <p className="mt-2 mb-5 text-sm leading-6 text-muted-foreground">
          Une désactivation ferme toutes les sessions. La réactivation permet de
          se reconnecter, sans restaurer les anciennes sessions.
        </p>
        {message && (
          <p role="alert" className="mb-4 text-sm text-danger">
            {message}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <ConfirmDialog
            title={
              target.isActive
                ? "Désactiver ce compte ?"
                : "Réactiver ce compte ?"
            }
            description={
              target.isActive
                ? "La personne sera immédiatement déconnectée de tous ses appareils."
                : "La personne pourra de nouveau se connecter à Harnois."
            }
            pending={pending}
            trigger={
              <Button
                variant="outline"
                disabled={own || !status.recent || pending}
              >
                {target.isActive
                  ? "Désactiver le compte"
                  : "Réactiver le compte"}
              </Button>
            }
            onConfirm={() => command("active")}
          />
          <ConfirmDialog
            title="Révoquer toutes les sessions ?"
            description="La personne devra se reconnecter sur tous ses appareils. Son compte reste actif."
            pending={pending}
            trigger={
              <Button
                variant="outline"
                disabled={own || !status.recent || pending}
              >
                Révoquer toutes les sessions
              </Button>
            }
            onConfirm={() => command("revoke-sessions")}
          />
        </div>
        {own && (
          <p className="mt-4 text-xs text-muted-foreground">
            Gérez vos propres sessions depuis votre page Sécurité.
          </p>
        )}
      </section>
    </div>
  );
}
