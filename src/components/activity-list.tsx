import type { ActivityEntry } from "@/db/schema";
import { timeAgo } from "@/lib/utils";

export function describe(entry: Pick<ActivityEntry, "action" | "details">): string {
  const d = (entry.details ?? {}) as Record<string, string | number | undefined>;
  switch (entry.action) {
    case "brand_created":
      return "created the brand";
    case "brand_updated":
      return "edited brand details";
    case "status_changed":
      return `moved it from ${d.from ?? "?"} to ${d.to ?? "?"}`;
    case "phase_done":
      return `finished phase ${d.phase}: ${d.name}`;
    case "phase_updated":
      return `set phase ${d.phase} to ${String(d.status ?? "").replace("_", " ")}`;
    case "checklist_ticked":
      return `ticked "${d.label}"`;
    case "checklist_unticked":
      return `unticked "${d.label}"`;
    case "note_added":
      return d.preview ? `commented: "${d.preview}"` : "added a comment";
    case "note_replied":
      return d.preview ? `replied: "${d.preview}"` : "replied to a comment";
    case "note_edited":
      return "edited a comment";
    case "note_done":
      return d.preview ? `marked a comment done: "${d.preview}"` : "marked a comment done";
    case "note_reopened":
      return "reopened a comment";
    case "blocker_opened":
      return `opened a blocker: ${d.description ?? ""}`;
    case "blocker_resolved":
      return `resolved a blocker: ${d.description ?? ""}`;
    case "blocker_reopened":
      return `reopened a blocker: ${d.description ?? ""}`;
    case "prompt_saved":
      return `saved prompt version ${d.version}`;
    default:
      return entry.action.replace(/_/g, " ");
  }
}

export function ActivityList({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="space-y-3">
      {entries.map((e) => (
        <li key={e.id} className="flex gap-3 text-sm">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground/40" />
          <div>
            <span className="font-medium">{e.actorName ?? "Someone"}</span> {describe(e)}
            <div className="text-xs text-muted-foreground">{timeAgo(e.createdAt)}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
