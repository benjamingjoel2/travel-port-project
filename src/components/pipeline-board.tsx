"use client";

import { useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { toast } from "sonner";
import type { PipelineStage } from "@/db/schema";
import type { BrandSummary } from "@/lib/data/brands";
import { changeStage } from "@/lib/actions/brands";
import { orderStagesForBoard, stageMoveBlockedReason } from "@/lib/pipeline";
import { cn } from "@/lib/utils";
import { MessageSquareIcon } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { TypeBadge } from "@/components/type-badge";
import { ProgressPill } from "@/components/progress-pill";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Move = { brandId: string; stageId: string };

export function PipelineBoard({ brands, stages, editable }: { brands: BrandSummary[]; stages: PipelineStage[]; editable: boolean }) {
  const columns = useMemo(() => orderStagesForBoard(stages), [stages]);
  const [optimistic, applyMove] = useOptimistic(brands, (state: BrandSummary[], move: Move) =>
    state.map((b) => (b.id === move.brandId ? { ...b, stageId: move.stageId, stage: stages.find((s) => s.id === move.stageId) ?? b.stage } : b)),
  );
  const [, start] = useTransition();
  const [active, setActive] = useState<BrandSummary | null>(null);
  const [blocked, setBlocked] = useState<{ stage: string; items: string[] } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const lastDragEnd = useRef(0);
  const onDragStart = (e: DragStartEvent) => setActive(optimistic.find((b) => b.id === e.active.id) ?? null);

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    lastDragEnd.current = Date.now();
    const brand = optimistic.find((b) => b.id === e.active.id);
    const target = columns.find((s) => s.id === e.over?.id);
    if (!brand || !target || brand.stageId === target.id) return;
    const reason = stageMoveBlockedReason(target, brand.missingRequiredLabels);
    if (reason) {
      setBlocked({ stage: target.name, items: brand.missingRequiredLabels });
      return;
    }
    start(async () => {
      applyMove({ brandId: brand.id, stageId: target.id });
      const res = await changeStage(brand.id, target.id);
      if (res.ok) toast.success(`${brand.name} → ${target.name}`);
      else toast.error(res.error);
    });
  };

  return (
    <>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {columns.map((stage) => (
            <Column key={stage.id} stage={stage} brands={optimistic.filter((b) => b.stageId === stage.id)} editable={editable} lastDragEnd={lastDragEnd} />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>{active ? <BrandCard brand={active} dragging /> : null}</DragOverlay>
      </DndContext>

      <Dialog open={blocked !== null} onOpenChange={(o) => !o && setBlocked(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Not ready for {blocked?.stage}</DialogTitle>
            <DialogDescription>These required launch checklist items are still open:</DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm">{blocked?.items.map((m) => <li key={m}>{m}</li>)}</ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Column({ stage, brands, editable, lastDragEnd }: { stage: PipelineStage; brands: BrandSummary[]; editable: boolean; lastDragEnd: React.RefObject<number> }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, disabled: !editable });
  return (
    <div
      ref={setNodeRef}
      className={cn("flex w-64 shrink-0 flex-col rounded-lg border bg-muted/40 transition-colors", isOver && "border-primary/60 bg-accent", stage.isTerminal && "opacity-80")}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium">
        <span className="size-2 rounded-full" style={{ backgroundColor: stage.color }} />
        <span className="truncate">{stage.name}</span>
        <span className="ml-auto rounded-full bg-background px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{brands.length}</span>
      </div>
      <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
        {brands.map((b) => (
          <DraggableCard key={b.id} brand={b} editable={editable} lastDragEnd={lastDragEnd} />
        ))}
        {brands.length === 0 && <div className="flex flex-1 items-center justify-center rounded-md border border-dashed py-6 text-xs text-muted-foreground">Empty</div>}
      </div>
    </div>
  );
}

function DraggableCard({ brand, editable, lastDragEnd }: { brand: BrandSummary; editable: boolean; lastDragEnd: React.RefObject<number> }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: brand.id, disabled: !editable });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn(isDragging && "opacity-30", editable && "cursor-grab active:cursor-grabbing")}>
      <BrandCard brand={brand} lastDragEnd={lastDragEnd} />
    </div>
  );
}

function BrandCard({ brand, dragging, lastDragEnd }: { brand: BrandSummary; dragging?: boolean; lastDragEnd?: React.RefObject<number> }) {
  return (
    <div className={cn("rounded-md border bg-card p-2.5 text-sm shadow-xs", dragging && "rotate-1 shadow-lg")}>
      <div className="flex items-center gap-2">
        <BrandLogo name={brand.name} logoUrl={brand.logoUrl} logoData={brand.logoData} size={24} />
        <Link
          href={`/brands/${brand.slug}`}
          draggable={false}
          className="min-w-0 flex-1 truncate font-medium hover:underline"
          onClick={(e) => {
            // A click that ends a drag shouldn't navigate.
            if (lastDragEnd && Date.now() - lastDragEnd.current < 300) e.preventDefault();
          }}
        >
          {brand.name}
        </Link>
        {brand.openComments > 0 && (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-primary" title={`${brand.openComments} open comment${brand.openComments === 1 ? "" : "s"}`}>
            <MessageSquareIcon className="size-3" />
            {brand.openComments}
          </span>
        )}
        {brand.openBlockers > 0 && <span className="size-2 shrink-0 rounded-full bg-destructive" title={`${brand.openBlockers} open blocker(s)`} />}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        {brand.brandType !== "country" && <TypeBadge type={brand.brandType} className="px-1.5 py-0 text-[10px]" />}
        <span className="truncate">{brand.country}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <ProgressPill done={brand.phasesDone} total={brand.phasesTotal} title="Build phases" />
        <ProgressPill done={brand.checklistDone} total={brand.checklistTotal} title="Launch checklist" />
      </div>
      {brand.owner && <div className="mt-1.5 truncate text-xs text-muted-foreground">{brand.owner.name}</div>}
    </div>
  );
}
