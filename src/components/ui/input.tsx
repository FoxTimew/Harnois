import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-xl border border-border bg-card px-3.5 text-base outline-none placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/20 disabled:bg-muted",
        className,
      )}
      {...props}
    />
  );
}
