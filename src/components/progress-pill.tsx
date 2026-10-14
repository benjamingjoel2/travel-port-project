import { cn } from "@/lib/utils";

/** "3/5" with a tiny bar, used in tables and cards. */
export function ProgressPill({ done, total, className, title }: { done: number; total: number; className?: string; title?: string }) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs tabular-nums", className)} title={title}>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", pct >= 100 ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-muted-foreground">
        {done}/{total}
      </span>
    </span>
  );
}
