import * as React from "react";
import { cn } from "@/lib/utils";

function Progress({ value, max = 100, className, indicatorClassName, ...props }: React.ComponentProps<"div"> & { value: number; max?: number; indicatorClassName?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <div className={cn("h-full rounded-full bg-primary transition-[width]", indicatorClassName)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export { Progress };
