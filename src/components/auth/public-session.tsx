"use client";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { SessionControls } from "./session-controls";
export function PublicSession({ hideLogin = false }: { hideLogin?: boolean }) {
  const { data } = authClient.useSession();
  return data ? (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Link
        href="/profile/security"
        className="inline-flex min-h-11 items-center"
      >
        Mon compte
      </Link>
      <SessionControls />
    </div>
  ) : hideLogin ? null : (
    <Link
      href="/login"
      className="inline-flex min-h-11 items-center rounded-lg border border-current/20 px-4 text-sm"
    >
      Connexion
    </Link>
  );
}
