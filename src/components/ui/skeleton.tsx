export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-lg bg-muted motion-reduce:animate-none ${className}`}
    />
  );
}
export function TableSkeleton() {
  return (
    <div
      role="status"
      aria-label="Chargement"
      className="space-y-4 rounded-2xl border bg-card p-6"
    >
      <Skeleton className="h-10 w-1/3" />
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
      <span className="sr-only">Chargement en cours…</span>
    </div>
  );
}
