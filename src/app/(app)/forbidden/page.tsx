import Link from "next/link";
import { ShieldX } from "lucide-react";
import { requirePageUser } from "@/server/auth/require-page-user";
import { buttonVariants } from "@/components/ui/button";
export default async function ForbiddenPage() {
  await requirePageUser("/forbidden");
  return (
    <section className="mx-auto max-w-lg py-16 text-center">
      <ShieldX className="mx-auto mb-6 size-12 text-muted-foreground" />
      <p className="text-xs tracking-widest text-muted-foreground">
        ACCÈS LIMITÉ
      </p>
      <h1 className="mt-4 text-3xl font-semibold">Accès refusé</h1>
      <p className="my-6 text-sm leading-6 text-muted-foreground">
        Votre rôle ne permet pas de consulter cette page. Contactez votre
        administrateur si vous avez besoin de cet accès.
      </p>
      <Link href="/profile" className={buttonVariants()}>
        Revenir à mon profil
      </Link>
    </section>
  );
}
