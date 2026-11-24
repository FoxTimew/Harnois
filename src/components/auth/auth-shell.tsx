import Link from "next/link";
import { ArrowLeft, Shield, KeyRound } from "lucide-react";
import { PublicSession } from "./public-session";
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-svh lg:grid lg:grid-cols-[0.9fr_1.1fr]">
      <aside className="flex flex-col justify-between bg-primary px-6 py-6 text-primary-foreground sm:px-10 lg:min-h-svh lg:px-16 lg:py-12">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-3 text-2xl font-semibold tracking-tight"
        >
          <Shield size={25} strokeWidth={1.5} />
          harnois.
        </Link>
        <div className="hidden max-w-sm lg:block">
          <div className="mb-10 flex size-20 items-center justify-center rounded-3xl border border-white/20 bg-white/5">
            <KeyRound size={36} strokeWidth={1.2} />
          </div>
          <p className="text-5xl leading-tight tracking-tight">
            Votre équipe.
            <br />
            Votre espace.
          </p>
          <p className="mt-6 text-base leading-7 text-white/70">
            Un accès personnel à vos équipements et aux outils de votre
            quotidien.
          </p>
        </div>
        <p className="hidden text-xs text-white/60 lg:block">
          Harnois · Gestion de parc informatique
        </p>
      </aside>
      <section className="flex flex-col justify-center px-6 py-10 sm:px-12 lg:py-16">
        <div className="mx-auto w-full max-w-md">
          <PublicSession hideLogin />
          <Link
            href="/"
            className="mb-10 inline-flex min-h-11 items-center gap-2 text-xs text-muted-foreground"
          >
            <ArrowLeft size={15} />
            Retour à l’accueil
          </Link>
          <p className="mb-3 text-xs font-medium tracking-widest text-accent-foreground">
            ESPACE INTERNE
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 mb-8 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
          {children}
        </div>
      </section>
    </main>
  );
}
