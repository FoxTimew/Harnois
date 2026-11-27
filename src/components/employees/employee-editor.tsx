"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  employeeFieldsSchema,
  employeeStatuses,
  employeeStatusLabels,
  employeeTransitions,
  type EmployeeFields,
} from "@/lib/employee-validation";
import { saveEmployeeAction } from "@/app/(app)/employees/actions";
import { FormPanel } from "@/components/forms/form-panel";
import { RecentVerification } from "@/components/mfa/verification";
import { mfaRequest, type MfaStatus } from "@/lib/mfa-client";
import type { employeeOptions } from "@/server/services/employees";
export function EmployeeEditor({
  initialFields,
  id,
  updatedAt,
  options,
  admin,
  activeAccount,
  initialMfa,
}: {
  initialFields: EmployeeFields;
  id?: string;
  updatedAt?: string;
  options: Awaited<ReturnType<typeof employeeOptions>>;
  admin: boolean;
  activeAccount: boolean;
  initialMfa: MfaStatus;
}) {
  const router = useRouter();
  const [mfa, setMfa] = useState(initialMfa);
  const [immediate, setImmediate] = useState(false),
    [deactivate, setDeactivate] = useState(false);
  const form = useForm<EmployeeFields>({
    resolver: zodResolver(employeeFieldsSchema),
    defaultValues: initialFields,
  });
  const status = useWatch({ control: form.control, name: "status" });
  const departmentId = useWatch({
    control: form.control,
    name: "departmentId",
  });
  const organizationId = useWatch({
    control: form.control,
    name: "organizationId",
  });
  const needsRecent =
    deactivate ||
    Boolean(id && initialFields.status === "LEFT" && status !== "LEFT");
  const isImmediate = Boolean(
    id && initialFields.status === "ACTIVE" && status === "LEFT",
  );
  const nullable = {
    setValueAs: (value: string) => (value === "" ? null : value),
  };
  const allowed = id
    ? [
        initialFields.status,
        ...employeeTransitions[initialFields.status].filter(
          (value) =>
            initialFields.status !== "LEFT" ||
            (admin && value === "ONBOARDING"),
        ),
      ]
    : employeeStatuses;
  return (
    <div className="space-y-6">
      {needsRecent && !mfa.recent && (
        <section className="rounded-2xl border bg-card p-6">
          <RecentVerification
            status={mfa}
            onVerified={async () => setMfa(await mfaRequest("status"))}
          />
        </section>
      )}
      <section className="rounded-2xl border bg-card p-6 sm:p-8">
        <FormPanel
          form={form}
          disabled={(needsRecent && !mfa.recent) || (isImmediate && !immediate)}
          onSubmit={async (fields) => {
            const result = await saveEmployeeAction({
              ...(id ? { id, updatedAt } : {}),
              fields,
              immediateDepartureConfirmed: immediate,
              deactivateAccount: deactivate && status === "LEFT",
            });
            if (result.error === "REAUTHENTICATION_REQUIRED")
              setMfa((current) => ({ ...current, recent: false }));
            if (result.id) {
              router.push("/employees/" + result.id);
              router.refresh();
            }
            return result;
          }}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            {(
              [
                ["firstName", "Prénom", "text"],
                ["lastName", "Nom", "text"],
                ["email", "Email professionnel", "email"],
                ["phone", "Téléphone international", "tel"],
                ["jobTitle", "Poste", "text"],
              ] as const
            ).map(([name, label, type]) => (
              <label key={name} className="block text-sm">
                {label}
                {["firstName", "lastName", "email"].includes(name) ? " *" : ""}
                <input
                  className="field mt-2"
                  type={type}
                  maxLength={
                    name === "email" ? 254 : name === "phone" ? 60 : 160
                  }
                  {...form.register(
                    name,
                    name === "phone" || name === "jobTitle" ? nullable : {},
                  )}
                  aria-invalid={!!form.formState.errors[name]}
                />
                {form.formState.errors[name] && (
                  <span className="mt-1 block text-xs text-danger">
                    {name === "email"
                      ? "Adresse email invalide."
                      : form.formState.errors[name]?.message}
                  </span>
                )}
              </label>
            ))}
            <label className="block text-sm">
              Statut
              <select
                aria-label="Statut"
                className="field mt-2"
                {...form.register("status")}
              >
                {allowed.map((value) => (
                  <option key={value} value={value}>
                    {employeeStatusLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Date d’arrivée
              <input
                className="field mt-2"
                type="date"
                {...form.register("startDate", nullable)}
              />
              {form.formState.errors.startDate && (
                <span className="mt-1 block text-xs text-danger">
                  {form.formState.errors.startDate.message}
                </span>
              )}
            </label>
            <label className="block text-sm">
              Date de départ
              <input
                className="field mt-2"
                type="date"
                {...form.register("endDate", nullable)}
              />
              {form.formState.errors.endDate && (
                <span className="mt-1 block text-xs text-danger">
                  {form.formState.errors.endDate.message}
                </span>
              )}
            </label>
            <label className="block text-sm">
              Organisation
              <select
                className="field mt-2"
                {...form.register("organizationId", nullable)}
                disabled={Boolean(departmentId)}
              >
                <option value="">Aucune organisation</option>
                {options.organizations.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-muted-foreground">
                Déterminée par le pôle lorsqu’il est renseigné.
              </span>
            </label>
            <label className="block text-sm">
              Pôle
              <select
                className="field mt-2"
                {...form.register("departmentId", {
                  ...nullable,
                  onChange: (event) => {
                    const department = options.departments.find(
                      (row) => row.id === event.target.value,
                    );
                    if (department)
                      form.setValue(
                        "organizationId",
                        department.organizationId,
                      );
                  },
                })}
              >
                <option value="">Aucun pôle</option>
                {options.departments
                  .filter(
                    (row) =>
                      !organizationId || row.organizationId === organizationId,
                  )
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block text-sm">
              Site
              <select
                className="field mt-2"
                {...form.register("locationId", nullable)}
              >
                <option value="">Aucun site</option>
                {options.locations.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Manager
              <select
                className="field mt-2"
                {...form.register("managerId", nullable)}
              >
                <option value="">Aucun manager</option>
                {options.managers
                  .filter((row) => row.id !== id)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.firstName} {row.lastName}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          {isImmediate && (
            <label className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
              <input
                className="mt-1"
                type="checkbox"
                checked={immediate}
                onChange={(event) => setImmediate(event.target.checked)}
              />
              Départ immédiat, sans phase de préparation
            </label>
          )}
          {status === "LEFT" && (
            <p className="text-sm text-muted-foreground">
              La date de départ doit être renseignée et non future. Les
              collaborateurs non partis doivent être réaffectés.
            </p>
          )}
          {status === "LEFT" && activeAccount && (
            <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
              <p>Le compte Harnois lié est encore actif.</p>
              {admin ? (
                <label className="mt-3 flex items-start gap-3">
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={deactivate}
                    onChange={(event) => setDeactivate(event.target.checked)}
                  />
                  Désactiver aussi ce compte et fermer ses sessions
                  (vérification récente requise).
                </label>
              ) : (
                <p className="mt-2">
                  Un administrateur devra désactiver ce compte.
                </p>
              )}
            </div>
          )}
          {id && initialFields.status === "LEFT" && status !== "LEFT" && (
            <p className="text-sm text-muted-foreground">
              Le retour en arrivée ne réactive pas le compte utilisateur.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            * Champs obligatoires. Le changement d’email de la fiche ne modifie
            pas l’adresse de connexion du compte lié.
          </p>
        </FormPanel>
      </section>
    </div>
  );
}
