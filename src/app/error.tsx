"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <section role="alert" className="mx-auto max-w-lg px-6 py-20 text-center">
      <h1 className="text-3xl font-semibold">Une erreur est survenue</h1>
      <p className="my-6 text-sm text-muted-foreground">
        La page n’a pas pu être chargée. Réessayez dans un instant.
      </p>
      <Button onClick={retry}>Réessayer</Button>
    </section>
  );
}
