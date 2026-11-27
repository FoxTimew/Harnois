"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { recordId } from "@/lib/admin-validation";
import { FormPanel } from "@/components/forms/form-panel";
import { RecentVerification } from "@/components/mfa/verification";
import { mfaRequest, type MfaStatus } from "@/lib/mfa-client";
import { updateUserAction } from "@/app/(app)/admin/users/actions";
import type { employeeAccountLinkOptions } from "@/server/services/employees";
const schema = z.object({ userId: recordId });
export function EmployeeAccountLink({
  employeeId,
  options,
  initialMfa,
}: {
  employeeId: string;
  options: Awaited<ReturnType<typeof employeeAccountLinkOptions>>;
  initialMfa: MfaStatus;
}) {
  const router = useRouter(),
    [mfa, setMfa] = useState(initialMfa);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { userId: "" },
  });
  if (options.linked)
    return (
      <Link
        className="mt-4 inline-block text-sm text-primary underline"
        href={"/admin/users/" + options.linked.id}
      >
        Gérer le compte {options.linked.name}
      </Link>
    );
  return (
    <div className="mt-6 border-t pt-5">
      <h3 className="mb-3 text-sm font-medium">Lier un compte existant</h3>
      {!mfa.recent && (
        <RecentVerification
          status={mfa}
          onVerified={async () => setMfa(await mfaRequest("status"))}
        />
      )}
      <FormPanel
        form={form}
        disabled={
          !form.formState.isReady || !mfa.recent || !options.available.length
        }
        submitLabel="Lier le compte"
        onSubmit={async (data) => {
          const result = await updateUserAction({
            operation: "employee",
            employeeId,
            userId: data.userId,
          });
          if (result.error === "REAUTHENTICATION_REQUIRED")
            setMfa((current) => ({ ...current, recent: false }));
          if (!result.error) router.refresh();
          return result;
        }}
      >
        <label className="block text-xs">
          Compte sans employé lié
          <select
            aria-label="Compte sans employé lié"
            disabled={!form.formState.isReady}
            className="field mt-2"
            {...form.register("userId")}
          >
            <option value="">Choisir un compte</option>
            {options.available.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} — {row.email}
              </option>
            ))}
          </select>
        </label>
        {form.formState.errors.userId && (
          <p className="text-xs text-danger">Choisissez un compte.</p>
        )}
      </FormPanel>
    </div>
  );
}
