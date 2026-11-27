"use client";
export default function GlobalError({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <html lang="fr">
      <body
        style={{
          fontFamily: "Arial, sans-serif",
          margin: "4rem 1.5rem",
          textAlign: "center",
        }}
      >
        <h1>Une erreur est survenue</h1>
        <p>Harnois est temporairement indisponible.</p>
        <button onClick={retry}>Réessayer</button>
      </body>
    </html>
  );
}
