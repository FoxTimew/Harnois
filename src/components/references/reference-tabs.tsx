import Link from "next/link";
export function ReferenceTabs({ current }: { current: string }) {
  return (
    <nav aria-label="Référentiels" className="mb-8 flex flex-wrap gap-2">
      {Object.entries({
        organizations: "Organisations",
        departments: "Pôles",
        locations: "Sites",
        categories: "Catégories",
        suppliers: "Fournisseurs",
      }).map(([key, label]) => (
        <Link
          key={key}
          href={"/references/" + key}
          aria-current={key === current ? "page" : undefined}
          className={
            "rounded-xl px-4 py-3 text-sm " +
            (key === current
              ? "bg-primary text-primary-foreground"
              : "border bg-card hover:bg-accent")
          }
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
