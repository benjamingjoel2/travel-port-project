"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { BrandChecklistItem } from "@/db/schema";
import { addMissingTemplateItems, setChecklistDone, updateChecklistDetails } from "@/lib/actions/checklist";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

export function ChecklistPanel({ brandId, items, editable }: { brandId: string; items: BrandChecklistItem[]; editable: boolean }) {
  const [pending, start] = useTransition();
  const done = items.filter((i) => i.done).length;
  const missing = items.filter((i) => i.required && !i.done);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>
            {done} of {items.length} done
          </span>
          <span className={missing.length ? "text-muted-foreground" : "font-medium text-success"}>
            {missing.length === 0 ? "Ready to go live" : `${missing.length} required left before Live`}
          </span>
        </div>
        <Progress value={done} max={items.length || 1} indicatorClassName={missing.length === 0 ? "bg-success" : undefined} />
      </div>

      <ul className="divide-y rounded-md border">
        {items.map((item) => (
          <ChecklistRow key={item.id} item={item} editable={editable} />
        ))}
      </ul>

      {editable && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await addMissingTemplateItems(brandId);
              if (!res.ok) toast.error(res.error);
              else toast.success(res.added ? `Added ${res.added} new item${res.added === 1 ? "" : "s"} from the template` : "Already up to date with the template");
            })
          }
        >
          Sync with checklist template
        </Button>
      )}
    </div>
  );
}

function ChecklistRow({ item, editable }: { item: BrandChecklistItem; editable: boolean }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(item.detail ?? "");
  const [note, setNote] = useState(item.note ?? "");

  const toggle = (checked: boolean) =>
    start(async () => {
      const res = await setChecklistDone(item.id, checked);
      if (!res.ok) toast.error(res.error);
    });

  const save = () =>
    start(async () => {
      const res = await updateChecklistDetails(item.id, { detail, note });
      if (res.ok) {
        toast.success("Saved");
        setOpen(false);
      } else toast.error(res.error);
    });

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start gap-3">
        <Checkbox checked={item.done} disabled={!editable || pending} onCheckedChange={(v) => toggle(v === true)} className="mt-0.5" aria-label={item.label} />
        <div className="min-w-0 flex-1 text-sm">
          <div className={cn(item.done && "text-muted-foreground line-through")}>{item.label}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            {!item.required && <span>Optional</span>}
            {item.done && item.doneAt && <span>Done {formatDate(item.doneAt)}</span>}
            {item.detail && (
              <span>
                {item.detailLabel ?? "Detail"}: <span className="text-foreground">{item.detail}</span>
              </span>
            )}
          </div>
          {item.note && !open && <p className="mt-1 text-xs whitespace-pre-wrap text-muted-foreground">{item.note}</p>}
        </div>
        {editable && (
          <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setOpen((v) => !v)}>
            {open ? "Close" : item.detailLabel ? "Details" : "Note"}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 ml-7 grid gap-2 sm:grid-cols-2">
          {item.detailLabel && <Input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={item.detailLabel} aria-label={item.detailLabel} />}
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Note" className={item.detailLabel ? "" : "sm:col-span-2"} />
          <div className="sm:col-span-2">
            <Button size="sm" onClick={save} disabled={pending}>
              Save
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
