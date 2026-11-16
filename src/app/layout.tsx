import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Harnois — Gestion de parc informatique",
  description: "Votre espace interne de gestion de parc informatique.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
