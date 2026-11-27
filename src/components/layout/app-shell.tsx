"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  ArrowLeftToLine,
  ArrowRightFromLine,
  ChevronDown,
  Ellipsis,
  ShieldCheck,
  Users,
  UserRound,
  History,
  Mail,
  LayoutDashboard,
  Monitor,
  Layers,
  KeyRound,
  Receipt,
  Ticket,
  ListChecks,
  LogOut,
  Sun,
  Moon,
  Laptop,
  Settings2,
} from "lucide-react";
import { personalNavigation, type NavigationLink } from "@/lib/navigation";
import { authClient } from "@/lib/auth-client";
import { roleLabels } from "@/lib/auth-messages";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
const icons = {
  dashboard: LayoutDashboard,
  people: Users,
  profile: UserRound,
  computer: Monitor,
  software: Layers,
  key: KeyRound,
  invoice: Receipt,
  ticket: Ticket,
  checklist: ListChecks,
  mail: Mail,
  shield: ShieldCheck,
  history: History,
  admin: Settings2,
};
export function AppShell({
  children,
  main,
  admin,
  user,
}: {
  children: React.ReactNode;
  main: NavigationLink[];
  admin: NavigationLink[];
  user: { name: string; role: keyof typeof roleLabels };
}) {
  const path = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  // Preserve Better Auth's HTTP cookie renewal; RSC reads intentionally disable refresh.
  useEffect(() => {
    void authClient.getSession().catch(() => undefined);
  }, []);
  const adminLink: NavigationLink[] = admin.length
    ? [
        {
          id: "admin",
          label: "Administration",
          href: admin[0].href,
          icon: "admin",
        },
      ]
    : [];
  const links = [...main, ...adminLink, ...personalNavigation];
  const active = (item: NavigationLink) =>
    item.id === "admin"
      ? path.startsWith("/admin")
      : item.href === "/profile"
        ? path === "/profile"
        : path === item.href || path.startsWith(item.href + "/");
  const current = [...admin, ...personalNavigation, ...main]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => path === item.href || path.startsWith(item.href + "/"));
  function navLink(item: NavigationLink, compact = false) {
    const Icon = icons[item.icon as keyof typeof icons] ?? LayoutDashboard;
    const link = (
      <Link
        href={item.href}
        aria-label={item.label}
        aria-current={active(item) ? "page" : undefined}
        className={cn(
          "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm transition-colors",
          active(item)
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
          compact && "justify-center px-2",
        )}
      >
        <Icon className="size-5 shrink-0" aria-hidden />
        {!compact && item.label}
      </Link>
    );
    return compact ? (
      <Tooltip.Root key={item.id}>
        <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            className="z-50 rounded-lg bg-foreground px-3 py-2 text-sm text-background"
          >
            {item.label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    ) : (
      <div key={item.id}>{link}</div>
    );
  }
  async function logout() {
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("SIGN_OUT_FAILED");
      router.replace("/login");
      router.refresh();
    } catch {
      toast.error("La déconnexion a échoué. Réessayez.");
    }
  }
  return (
    <Tooltip.Provider delayDuration={200}>
      <div
        className={cn(
          "min-h-screen md:grid",
          collapsed
            ? "md:grid-cols-[5.5rem_minmax(0,1fr)]"
            : "md:grid-cols-[15.5rem_minmax(0,1fr)]",
        )}
      >
        <a
          href="#main-content"
          className="sr-only fixed top-2 left-2 z-[60] rounded-lg bg-card p-3 focus:not-sr-only"
        >
          Aller au contenu
        </a>
        <aside
          className="sticky top-0 hidden h-screen flex-col border-r bg-card p-5 md:flex"
          aria-label="Barre latérale"
        >
          <Link
            href="/profile"
            aria-label="Harnois, mon profil"
            className="mb-12 flex items-center gap-3 text-xl font-semibold tracking-tight"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              h.
            </span>
            {!collapsed && "harnois"}
          </Link>
          {!collapsed && (
            <p className="mb-3 px-3 text-[10px] font-semibold tracking-[0.2em] text-muted-foreground">
              VOTRE ESPACE
            </p>
          )}
          <nav aria-label="Navigation principale" className="space-y-2">
            {links.map((item) => navLink(item, collapsed))}
          </nav>
          <div className="mt-auto pt-8">
            {!collapsed && (
              <div className="mb-5 rounded-xl bg-muted p-4 text-xs leading-5 text-muted-foreground">
                Un espace commun.
                <br />
                <span className="font-medium text-foreground">
                  Des accès maîtrisés.
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              aria-label={
                collapsed ? "Déplier la navigation" : "Replier la navigation"
              }
              onClick={() => setCollapsed(!collapsed)}
              className="w-full"
            >
              {collapsed ? (
                <ArrowRightFromLine className="size-5" />
              ) : (
                <>
                  <ArrowLeftToLine className="size-4" />
                  Replier
                </>
              )}
            </Button>
          </div>
        </aside>
        <div className="min-w-0">
          <header className="sticky top-0 z-20 flex min-h-20 items-center justify-between gap-3 border-b bg-background/95 px-5 backdrop-blur md:px-10">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">
                HARNOIS <span className="px-2">/</span> ESPACE INTERNE
              </p>
              <p className="mt-1 truncate text-sm font-medium">
                {path === "/forbidden"
                  ? "Accès refusé"
                  : path === "/admin/ui"
                    ? "Composants"
                    : (current?.label ?? "Mon espace")}
              </p>
            </div>
            {/* Notification control reserved for phase 11. */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button
                  variant="outline"
                  aria-label="Menu utilisateur"
                  className="shrink-0 rounded-full px-2 sm:px-3"
                >
                  <span className="grid size-7 place-items-center rounded-full bg-accent text-xs">
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden max-w-32 truncate sm:inline">
                    {user.name}
                  </span>
                  <ChevronDown className="size-4" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className="z-50 min-w-64 rounded-xl border bg-card p-2 shadow-xl"
                >
                  <DropdownMenu.Label className="px-3 py-2 text-xs text-muted-foreground">
                    {roleLabels[user.role]}
                  </DropdownMenu.Label>
                  {personalNavigation.map((item) => (
                    <DropdownMenu.Item key={item.id} asChild>
                      <Link className="menu-item" href={item.href}>
                        {item.label}
                      </Link>
                    </DropdownMenu.Item>
                  ))}
                  <DropdownMenu.Separator className="my-2 h-px bg-border" />
                  <DropdownMenu.Label className="px-3 py-1 text-xs text-muted-foreground">
                    Apparence
                  </DropdownMenu.Label>
                  <DropdownMenu.RadioGroup
                    value={theme ?? "system"}
                    onValueChange={setTheme}
                  >
                    {[
                      ["light", "Clair", Sun],
                      ["dark", "Sombre", Moon],
                      ["system", "Système", Laptop],
                    ].map(([value, label, Icon]) => {
                      const ThemeIcon = Icon as typeof Sun;
                      return (
                        <DropdownMenu.RadioItem
                          className="menu-item"
                          key={String(value)}
                          value={String(value)}
                        >
                          <ThemeIcon className="size-4" />
                          {String(label)}
                          <DropdownMenu.ItemIndicator className="ml-auto">
                            ✓
                          </DropdownMenu.ItemIndicator>
                        </DropdownMenu.RadioItem>
                      );
                    })}
                  </DropdownMenu.RadioGroup>
                  <DropdownMenu.Separator className="my-2 h-px bg-border" />
                  <DropdownMenu.Item
                    className="menu-item"
                    onSelect={() => void logout()}
                  >
                    <LogOut className="size-4" />
                    Déconnexion
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </header>
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto max-w-[1480px] px-5 pt-8 pb-28 outline-none sm:px-8 md:px-10 md:py-10"
          >
            {children}
          </main>
        </div>
        <nav
          aria-label="Navigation mobile"
          className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around gap-1 border-t bg-card px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
        >
          {links.slice(0, 4).map((item) => {
            const Icon =
              icons[item.icon as keyof typeof icons] ?? LayoutDashboard;
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active(item) ? "page" : undefined}
                className={cn(
                  "flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px]",
                  active(item)
                    ? "bg-accent font-semibold text-foreground"
                    : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            );
          })}
          <Sheet
            title="Votre espace"
            description="Navigation et accès au compte"
            trigger={
              <Button
                variant="ghost"
                className="flex min-h-12 flex-col gap-1 px-3 text-[10px]"
              >
                <Ellipsis className="size-5" />
                Plus
              </Button>
            }
          >
            <nav aria-label="Tous les accès" className="space-y-2">
              {links.map((item) => navLink(item))}
              {admin.map((item) => navLink(item))}
            </nav>
            <Button
              variant="outline"
              onClick={() => void logout()}
              className="mt-6 w-full"
            >
              Déconnexion
            </Button>
          </Sheet>
        </nav>
      </div>
    </Tooltip.Provider>
  );
}
