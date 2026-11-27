"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  assignmentSchema,
  returnSchema,
  loanDateSchema,
} from "@/lib/assignment-validation";
import { conditionLabels } from "@/lib/equipment-validation";
import { displayCivilDate } from "@/lib/date-only";
import { assignmentAction } from "@/app/(app)/equipment/actions";
import { FormPanel } from "@/components/forms/form-panel";
import type {
  equipmentDetail,
  equipmentOptions,
} from "@/server/services/equipment";
type Detail = Awaited<ReturnType<typeof equipmentDetail>>;
export function AssignmentPanel({
  row,
  employees,
}: {
  row: Detail;
  employees: Awaited<ReturnType<typeof equipmentOptions>>["employees"];
}) {
  const active = row.assignments[0];
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-semibold">
        {active ? "Assignation en cours" : "Attribuer le matériel"}
      </h2>
      {active ? (
        <>
          <p className="font-medium">
            {active.employee.firstName} {active.employee.lastName}
          </p>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">
            {active.kind === "LOAN"
              ? "Prêt temporaire · retour prévu " +
                displayCivilDate(active.expectedReturnDate)
              : "Assignation permanente"}
          </p>
          <CloseForm assignmentId={active.id} />
          {active.kind === "LOAN" && (
            <LoanDateForm
              assignmentId={active.id}
              date={active.expectedReturnDate!}
            />
          )}
        </>
      ) : row.status === "IN_STOCK" ? (
        <AssignForm row={row} employees={employees} />
      ) : (
        <p className="text-sm text-muted-foreground">
          L’équipement doit être en stock et en état d’usage pour être attribué.
        </p>
      )}
    </section>
  );
}
function AssignForm({
  row,
  employees,
}: {
  row: Detail;
  employees: Awaited<ReturnType<typeof equipmentOptions>>["employees"];
}) {
  const router = useRouter(),
    form = useForm<z.infer<typeof assignmentSchema>>({
      resolver: zodResolver(assignmentSchema) as Resolver<
        z.infer<typeof assignmentSchema>
      >,
      defaultValues: {
        equipmentId: row.id,
        employeeId: "",
        kind: "PERMANENT",
        conditionOut: row.condition,
        expectedReturnDate: null,
        notes: "",
      },
    });
  const kind = useWatch({ control: form.control, name: "kind" });
  return (
    <FormPanel
      form={form}
      submitLabel="Confirmer l’assignation"
      onSubmit={async (data) => {
        const result = await assignmentAction("assign", {
          ...data,
          expectedReturnDate:
            data.kind === "LOAN" ? data.expectedReturnDate : null,
        });
        if (!result.error) router.refresh();
        return result;
      }}
    >
      <label className="block space-y-2 text-sm">
        <span>Employé *</span>
        <select className="field" {...form.register("employeeId")}>
          <option value="">Choisir un employé</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.firstName} {e.lastName}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-2 text-sm">
        <span>Type d’assignation</span>
        <select className="field" {...form.register("kind")}>
          <option value="PERMANENT">Permanente</option>
          <option value="LOAN">Prêt temporaire</option>
        </select>
      </label>
      {kind === "LOAN" && (
        <label className="block space-y-2 text-sm">
          <span>Retour prévu *</span>
          <input
            type="date"
            className="field"
            {...form.register("expectedReturnDate", {
              setValueAs: (v) => v || null,
            })}
          />
        </label>
      )}
      <label className="block space-y-2 text-sm">
        <span>État à la remise</span>
        <select className="field" {...form.register("conditionOut")}>
          {Object.entries(conditionLabels)
            .filter(([v]) => v !== "DAMAGED")
            .map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
        </select>
      </label>
      <label className="block space-y-2 text-sm">
        <span>Notes de remise</span>
        <textarea className="field" {...form.register("notes")} />
      </label>
      {Object.keys(form.formState.errors).length > 0 && (
        <p role="alert" className="text-sm text-danger">
          Sélectionnez un employé et vérifiez les informations du prêt.
        </p>
      )}
    </FormPanel>
  );
}
function CloseForm({ assignmentId }: { assignmentId: string }) {
  const router = useRouter(),
    [confirmed, setConfirmed] = useState(false),
    form = useForm<z.infer<typeof returnSchema>>({
      resolver: zodResolver(returnSchema) as Resolver<
        z.infer<typeof returnSchema>
      >,
      defaultValues: {
        assignmentId,
        operation: "return",
        conditionIn: "GOOD",
        notes: "",
      },
    });
  const operation = useWatch({ control: form.control, name: "operation" });
  return (
    <FormPanel
      form={form}
      disabled={!confirmed}
      submitLabel={
        operation === "lost" ? "Déclarer la perte" : "Enregistrer le retour"
      }
      onSubmit={async (data) => {
        const result = await assignmentAction("return", data);
        if (!result.error) router.refresh();
        return result;
      }}
    >
      <label className="block space-y-2 text-sm">
        <span>Mouvement</span>
        <select
          className="field"
          {...form.register("operation")}
          onChange={(e) => {
            form.setValue("operation", e.target.value as "return" | "lost");
            setConfirmed(false);
          }}
        >
          <option value="return">Restitution du matériel</option>
          <option value="lost">Déclaration de perte</option>
        </select>
      </label>
      {operation === "return" && (
        <label className="block space-y-2 text-sm">
          <span>État au retour *</span>
          <select className="field" {...form.register("conditionIn")}>
            {Object.entries(conditionLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block space-y-2 text-sm">
        <span>
          {operation === "lost" ? "Motif de perte *" : "Notes de retour"}
        </span>
        <textarea
          className="field"
          required={operation === "lost"}
          {...form.register("notes")}
        />
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>
          Je confirme la clôture de cette assignation
          {operation === "lost"
            ? " pour perte du matériel"
            : " après restitution"}
          .
        </span>
      </label>
    </FormPanel>
  );
}
function LoanDateForm({
  assignmentId,
  date,
}: {
  assignmentId: string;
  date: string;
}) {
  const router = useRouter(),
    form = useForm<z.infer<typeof loanDateSchema>>({
      resolver: zodResolver(loanDateSchema),
      defaultValues: { assignmentId, expectedReturnDate: date },
    });
  return (
    <details className="mt-6 border-t pt-5">
      <summary className="cursor-pointer text-sm font-medium">
        Modifier l’échéance du prêt
      </summary>
      <div className="mt-4">
        <FormPanel
          form={form}
          submitLabel="Modifier l’échéance"
          onSubmit={async (data) => {
            const r = await assignmentAction("loan-date", data);
            if (!r.error) router.refresh();
            return r;
          }}
        >
          <label className="block space-y-2 text-sm">
            <span>Nouvelle date de retour</span>
            <input
              type="date"
              className="field"
              {...form.register("expectedReturnDate")}
            />
          </label>
        </FormPanel>
      </div>
    </details>
  );
}
