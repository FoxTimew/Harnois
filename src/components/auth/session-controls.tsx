"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { FormMessage } from "./form-message";
/** HTTP refresh can write renewed cookies; Server Component reads deliberately cannot. */
export function SessionControls() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void authClient.getSession().catch(() => undefined);
  }, []);
  return (
    <div>
      <Button
        variant="ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const result = await authClient.signOut();
            if (result.error) throw new Error();
            router.push("/login");
            router.refresh();
          } catch {
            setError("La déconnexion a échoué. Réessayez.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <LogOut size={16} />
        Déconnexion
      </Button>
      <FormMessage>{error}</FormMessage>
    </div>
  );
}
