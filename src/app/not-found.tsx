import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24 text-center">
      <p className="text-xs tracking-widest text-muted-foreground">404</p>
      <h1 className="mt-4 text-3xl font-semibold">Page introuvable</h1>
      <p className="my-6 text-sm text-muted-foreground">
        Cette adresse n’existe pas ou n’est plus disponible.
      </p>
      <Link className={buttonVariants()} href="/profile">
        Revenir à mon espace
      </Link>
    </main>
  );
}
