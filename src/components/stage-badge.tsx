import type { PipelineStage } from "@/db/schema";
import { cn } from "@/lib/utils";

export function StageBadge({ stage, className }: { stage: Pick<PipelineStage, "name" | "color">; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap", className)}>
      <span className="size-2 rounded-full" style={{ backgroundColor: stage.color }} />
      {stage.name}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: "high" | "medium" | "low" }) {
  const styles = {
    high: "bg-destructive/10 text-destructive",
    medium: "bg-warning/25 text-foreground",
    low: "bg-muted text-muted-foreground",
  } as const;
  return <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize", styles[priority])}>{priority}</span>;
}
