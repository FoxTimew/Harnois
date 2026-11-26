"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { safeReturnUrl } from "@/lib/return-url";
import { mfaRequest, type MfaStatus } from "@/lib/mfa-client";
import { Enrollment } from "./enrollment";
import { Verification } from "./verification";
import { RecoveryCodes } from "./recovery-codes";
export function MfaFlow({
  initial,
  mode,
  returnTo,
}: {
  initial: MfaStatus;
  mode: "setup" | "verify";
  returnTo: string;
}) {
  const [status, setStatus] = useState(initial);
  const [codes, setCodes] = useState<string[] | null>(null);
  const router = useRouter();
  const finish = () => {
    setCodes(null);
    router.replace(safeReturnUrl(returnTo));
    router.refresh();
  };
  if (codes) return <RecoveryCodes codes={codes} onDone={finish} />;
  return mode === "setup" ? (
    <Enrollment
      status={status}
      onRefresh={async () => setStatus(await mfaRequest<MfaStatus>("status"))}
      onComplete={(nextCodes) => {
        if (nextCodes) setCodes(nextCodes);
        else finish();
      }}
    />
  ) : (
    <Verification status={status} onVerified={finish} />
  );
}
