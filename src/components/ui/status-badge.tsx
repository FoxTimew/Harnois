import { cn } from "@/lib/utils";
export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "positive" | "neutral" | "warning";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        tone === "positive"
          ? "bg-success/10 text-success"
          : tone === "warning"
            ? "bg-warning/10 text-warning"
            : "bg-muted text-muted-foreground",
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
