"use client";
import { useState } from "react";
import {
  FormProvider,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form";
import { toast } from "sonner";
import { actionMessage, type ActionResult } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
/** Use the same RHF/Zod form inside a page or a Sheet; server errors remain visible. */
export function FormPanel<T extends FieldValues>({
  form,
  onSubmit,
  children,
  submitLabel = "Enregistrer",
  disabled = false,
}: {
  form: UseFormReturn<T>;
  onSubmit: (data: T) => Promise<ActionResult>;
  children: React.ReactNode;
  submitLabel?: string;
  disabled?: boolean;
}) {
  const [message, setMessage] = useState("");
  return (
    <FormProvider {...form}>
      <form
        className="space-y-5"
        onSubmit={form.handleSubmit(async (data) => {
          setMessage("");
          try {
            const result = await onSubmit(data);
            if (result.error)
              setMessage(actionMessage(result.error, result.details));
            else {
              toast.success(result.success ?? "Modification enregistrée.");
            }
          } catch {
            setMessage("L’action n’a pas abouti. Réessayez.");
          }
        })}
      >
        {children}
        {message && (
          <p
            role="alert"
            className="rounded-lg bg-danger/10 p-3 text-sm text-danger"
          >
            {message}
          </p>
        )}
        <Button disabled={disabled || form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Enregistrement…" : submitLabel}
        </Button>
      </form>
    </FormProvider>
  );
}
