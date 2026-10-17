import type { PipelineStage } from "@/db/schema";

/**
 * Client-side mirror of the server rule: a brand can't enter a checklist-gated
 * stage while required checklist items are open. Returns the reason, or null.
 */
export function stageMoveBlockedReason(target: Pick<PipelineStage, "name" | "requiresChecklist">, missingRequiredLabels: string[]): string | null {
  if (!target.requiresChecklist || missingRequiredLabels.length === 0) return null;
  const n = missingRequiredLabels.length;
  return `Can't move to "${target.name}" yet: ${n} required checklist item${n === 1 ? "" : "s"} still open.`;
}

/** Columns for the board: active stages in order, then Paused/Dropped. */
export function orderStagesForBoard<T extends Pick<PipelineStage, "sortOrder" | "isTerminal">>(stages: T[]): T[] {
  return [...stages].sort((a, b) => Number(a.isTerminal) - Number(b.isTerminal) || a.sortOrder - b.sortOrder);
}
