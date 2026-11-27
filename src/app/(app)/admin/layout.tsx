import Link from "next/link";
import { requirePageUser } from "@/server/auth/require-page-user";
import { visibleNavigation } from "@/server/auth/navigation";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requirePageUser();
  const { admin } = visibleNavigation(user);
  return (
    <>
      <nav
        aria-label="Administration"
        className="mb-8 flex flex-wrap gap-2 border-b pb-5"
      >
        {admin.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="rounded-full border bg-card px-4 py-2.5 text-xs font-medium hover:bg-accent"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}
