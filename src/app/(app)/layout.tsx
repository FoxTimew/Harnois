import Link from "next/link";
import { Shield } from "lucide-react";
import { requirePageUser } from "@/server/auth/require-page-user";
import { SessionControls } from "@/components/auth/session-controls";
export const dynamic = "force-dynamic";
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requirePageUser();
  return (
    <div className="mx-auto min-h-svh max-w-6xl px-5 sm:px-10">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b py-5">
        <Link
          href="/"
          className="flex items-center gap-2 text-xl font-semibold"
        >
          <Shield size={22} />
          harnois.
        </Link>
        <SessionControls />
      </header>
      <nav
        aria-label="Compte"
        className="flex flex-wrap gap-6 border-b py-4 text-sm"
      >
        <Link href="/profile/security" className="min-h-11 content-center">
          Sécurité
        </Link>
        {context.user.role === "ADMIN" && (
          <Link href="/admin/mfa" className="min-h-11 content-center">
            Réinitialisation 2FA
          </Link>
        )}
        {context.user.role === "ADMIN" && (
          <Link href="/admin/invitations" className="min-h-11 content-center">
            Invitations
          </Link>
        )}
      </nav>
      <main className="py-9 sm:py-12">{children}</main>
      <footer className="border-t py-6 text-xs text-muted-foreground">
        Harnois · Votre espace personnel
      </footer>
    </div>
  );
}
