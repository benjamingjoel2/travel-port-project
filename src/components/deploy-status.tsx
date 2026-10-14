import type { BrandActivity } from "@/lib/deploy-info";
import { deployStateLabel } from "@/lib/deploy-info";
import { cn, timeAgo } from "@/lib/utils";

const TONE = { ok: "bg-success", busy: "bg-warning animate-pulse", bad: "bg-destructive", muted: "bg-muted-foreground/40" } as const;

export function DeployDot({ state }: { state: string | null | undefined }) {
  const { label, tone } = deployStateLabel(state);
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", TONE[tone])} title={label} />;
}

/** One line: "● Ready · 2h ago · Add trip planner (claude/branch)". */
export function DeployLine({ activity }: { activity: BrandActivity }) {
  const d = activity.deploy;
  if (!d && !activity.pushedAt) return null;
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      {d ? (
        <>
          <DeployDot state={d.state} />
          <span className="shrink-0">
            Last deploy {deployStateLabel(d.state).label.toLowerCase()} {d.createdAt ? timeAgo(new Date(d.createdAt)) : ""}
          </span>
          {d.commitMessage && (
            <span className="truncate" title={d.commitMessage}>
              · {d.commitMessage}
              {d.branch && d.branch !== "main" ? ` (${d.branch})` : ""}
            </span>
          )}
        </>
      ) : (
        <span>Last push {timeAgo(activity.pushedAt)}</span>
      )}
    </div>
  );
}
