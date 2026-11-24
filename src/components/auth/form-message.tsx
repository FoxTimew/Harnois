export function FormMessage({
  children,
  success = false,
}: {
  children?: string | null;
  success?: boolean;
}) {
  if (!children) return null;
  return (
    <p
      role={success ? "status" : "alert"}
      className={`rounded-xl border p-3 text-sm leading-6 ${success ? "border-border bg-accent text-primary" : "border-red-200 bg-red-50 text-red-900"}`}
    >
      {children}
    </p>
  );
}
