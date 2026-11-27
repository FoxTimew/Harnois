import { requirePageUser } from "@/server/auth/require-page-user";
import { visibleNavigation } from "@/server/auth/navigation";
import { AppShell } from "@/components/layout/app-shell";
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requirePageUser();
  return (
    <AppShell
      {...visibleNavigation(user)}
      user={{ name: user.name, role: user.role }}
    >
      {children}
    </AppShell>
  );
}
