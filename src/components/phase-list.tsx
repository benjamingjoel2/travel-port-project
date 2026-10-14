"use client";

import { useState, useTransition } from "react";
import { CheckIcon, CircleDashedIcon, LoaderIcon } from "lucide-react";
import { toast } from "sonner";
import type { BuildPhase, PhaseStatus } from "@/db/schema";
import { updatePhase } from "@/lib/actions/brands";
import { PHASE_STATUSES, PHASE_STATUS_LABELS } from "@/lib/constants";
import { formatDate, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const ICONS = { not_started: CircleDashedIcon, in_progress: LoaderIcon, done: CheckIcon } as const;

export function PhaseList({ phases, editable }: { phases: BuildPhase[]; editable: boolean }) {
  return (
    <ol className="divide-y">
      {phases.map((p) => (
        <PhaseRow key={p.id} phase={p} editable={editable} />
      ))}
    </ol>
  );
}

function PhaseRow({ phase, editable }: { phase: BuildPhase; editable: boolean }) {
  const [pending, start] = useTransition();
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(phase.notes ?? "");
  const Icon = ICONS[phase.status];

  const setStatus = (status: PhaseStatus) =>
    start(async () => {
      const res = await updatePhase(phase.id, { status });
      if (!res.ok) toast.error(res.error);
    });

  const saveNotes = () =>
    start(async () => {
      const res = await updatePhase(phase.id, { status: phase.status, notes });
      if (res.ok) {
        toast.success("Notes saved");
        setEditingNotes(false);
      } else toast.error(res.error);
    });

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
      <div className="flex flex-1 items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
            phase.status === "done" && "border-success bg-success text-white",
            phase.status === "in_progress" && "border-warning bg-warning/30",
          )}
        >
          {phase.status === "not_started" ? phase.phaseNumber : <Icon className="size-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className={cn("text-sm font-medium", phase.status === "done" && "text-muted-foreground")}>
            Phase {phase.phaseNumber}: {phase.name}
          </div>
          <div className="text-xs text-muted-foreground">
            {PHASE_STATUS_LABELS[phase.status]}
            {phase.completedAt && ` · completed ${formatDate(phase.completedAt)}`}
          </div>
          {editingNotes ? (
            <div className="mt-2 space-y-2">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="e.g. Claude Code got stuck on the planner, fixed by …" />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveNotes} disabled={pending}>
                  Save notes
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingNotes(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-1 text-sm">
              {phase.notes ? <p className="whitespace-pre-wrap text-muted-foreground">{phase.notes}</p> : null}
              {editable && (
                <button type="button" onClick={() => setEditingNotes(true)} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                  {phase.notes ? "Edit notes" : "Add notes"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {editable && (
        <div className="flex gap-1 sm:pl-2">
          {PHASE_STATUSES.map((s) => (
            <Button key={s} size="sm" variant={phase.status === s ? "default" : "outline"} disabled={pending || phase.status === s} onClick={() => setStatus(s)}>
              {PHASE_STATUS_LABELS[s]}
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}
