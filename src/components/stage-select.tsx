"use client";

import { useState, useTransition } from "react";
import { ChevronDownIcon } from "lucide-react";
import { toast } from "sonner";
import type { PipelineStage } from "@/db/schema";
import { changeStage } from "@/lib/actions/brands";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StageBadge } from "@/components/stage-badge";

export function StageSelect({ brandId, stages, current, disabled, missingRequired }: { brandId: string; stages: PipelineStage[]; current: PipelineStage; disabled?: boolean; missingRequired: string[] }) {
  const [pending, start] = useTransition();
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  const pick = (stage: PipelineStage) => {
    if (stage.requiresChecklist && missingRequired.length > 0) {
      setBlockedMessage(stage.name);
      return;
    }
    start(async () => {
      const res = await changeStage(brandId, stage.id);
      if (res.ok) toast.success(`Moved to ${stage.name}`);
      else toast.error(res.error);
    });
  };

  if (disabled) return <StageBadge stage={current} />;

  const main = stages.filter((s) => !s.isTerminal);
  const terminal = stages.filter((s) => s.isTerminal);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={pending}>
          <button type="button" className="inline-flex items-center gap-1 rounded-md hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none cursor-pointer" aria-label="Change stage">
            <StageBadge stage={current} />
            <ChevronDownIcon className="size-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Move to</DropdownMenuLabel>
          {main.map((s) => (
            <DropdownMenuItem key={s.id} onClick={() => pick(s)} disabled={s.id === current.id}>
              <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} /> {s.name}
              {s.requiresChecklist && missingRequired.length > 0 && <span className="ml-auto text-xs text-muted-foreground">{missingRequired.length} left</span>}
            </DropdownMenuItem>
          ))}
          {terminal.length > 0 && <DropdownMenuSeparator />}
          {terminal.map((s) => (
            <DropdownMenuItem key={s.id} onClick={() => pick(s)} disabled={s.id === current.id}>
              <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} /> {s.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={blockedMessage !== null} onOpenChange={(o) => !o && setBlockedMessage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Not ready for {blockedMessage}</DialogTitle>
            <DialogDescription>These required launch checklist items are still open:</DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {missingRequired.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
