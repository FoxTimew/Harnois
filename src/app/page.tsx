import {
  ArrowUpRight,
  Laptop,
  Monitor,
  Shield,
  Smartphone,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { PublicSession } from "@/components/auth/public-session";

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-svh max-w-7xl flex-col px-6 sm:px-10 lg:px-16">
      <header className="flex items-center justify-between border-b border-border py-6 sm:py-8">
        <div className="flex items-center gap-3" aria-label="Harnois, accueil">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Shield size={20} strokeWidth={1.7} aria-hidden="true" />
          </span>
          <span className="text-xl font-semibold tracking-tight">
            harnois<span className="text-accent-foreground">.</span>
          </span>
        </div>
        <PublicSession />
      </header>

      <main
        id="main"
        className="grid flex-1 items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:gap-16"
      >
        <div>
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <span
              className="size-1.5 rounded-full bg-accent-foreground"
              aria-hidden="true"
            />
            Votre espace de travail
          </div>
          <h1 className="text-6xl font-semibold tracking-[-0.07em] sm:text-8xl">
            Harnois<span className="text-accent-foreground">.</span>
          </h1>
          <p className="mt-6 max-w-md text-2xl leading-snug font-medium tracking-tight sm:text-3xl">
            Votre parc,
            <br />à portée de main.
          </p>
          <p className="mt-6 max-w-sm text-base leading-7 text-muted-foreground">
            Un même espace pour prendre soin de vos équipements et accompagner
            vos équipes au quotidien.
          </p>
          <div className="mt-10 flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex size-8 items-center justify-center rounded-full border border-border">
              <ArrowUpRight size={16} aria-hidden="true" />
            </span>
            <Link href="/login" className="underline underline-offset-4">
              Accéder à mon espace
            </Link>
          </div>
        </div>

        <Card className="relative overflow-hidden rounded-3xl border-border bg-[#e9ede4] py-0 shadow-none">
          <CardContent className="px-7 py-8 sm:px-10 sm:py-10">
            <div className="flex items-center justify-between text-xs font-medium tracking-widest text-[#536347]">
              <span>CHAQUE ÉQUIPEMENT COMPTE</span>
              <span aria-hidden="true">01 / 01</span>
            </div>
            <div
              className="relative mx-auto my-12 flex h-52 max-w-xs items-center justify-center"
              aria-hidden="true"
            >
              <div className="absolute size-52 rounded-full border border-[#bdc8b2]" />
              <div className="absolute size-72 rounded-full border border-[#ced6c6]" />
              <div className="absolute bottom-3 -left-1 flex size-24 -rotate-6 items-center justify-center rounded-2xl border border-white bg-[#fbfcf8] shadow-lg shadow-[#344329]/5">
                <Laptop size={46} strokeWidth={1.2} />
              </div>
              <div className="flex size-36 -translate-y-3 rotate-6 items-center justify-center rounded-3xl border border-white bg-[#fbfcf8] shadow-lg shadow-[#344329]/5">
                <Monitor size={68} strokeWidth={1.1} />
              </div>
              <div className="absolute -right-1 bottom-0 flex h-28 w-20 rotate-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-[#344329]/10">
                <Smartphone size={44} strokeWidth={1.2} />
              </div>
            </div>
            <div className="border-t border-[#c7d0bd] pt-6">
              <p className="text-lg font-medium tracking-tight">
                Bien équipé. Bien accompagné.
              </p>
              <p className="mt-2 text-sm leading-6 text-[#536347]">
                Une vision claire, pour un quotidien plus simple.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>

      <footer className="flex flex-col gap-2 border-t border-border py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>Harnois · Gestion de parc informatique</p>
        <p>Conçu pour vos équipes.</p>
      </footer>
    </div>
  );
}
