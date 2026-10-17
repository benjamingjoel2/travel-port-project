"use client";

import { useState, useTransition } from "react";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { toast } from "sonner";
import type { ChecklistTemplateItem } from "@/db/schema";
import { addTemplateItem, applyTemplateToAllBrands, moveTemplateItem, updateTemplateItem } from "@/lib/actions/checklist-template";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export function ChecklistTemplateEditor({ items, canManage }: { items: ChecklistTemplateItem[]; canManage: boolean }) {
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");
  const [detailLabel, setDetailLabel] = useState("");
  const [required, setRequired] = useState(true);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "Something went wrong.");
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Launch checklist template</CardTitle>
        <CardDescription>New brands get every active item. Required items must be ticked before a brand can go Live.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y rounded-md border">
          {items.map((item, i) => (
            <TemplateRow key={item.id} item={item} canManage={canManage} first={i === 0} last={i === items.length - 1} pending={pending} run={run} />
          ))}
        </ul>

        {canManage && (
          <>
            <div className="space-y-2 rounded-md border p-3">
              <div className="text-sm font-medium">Add an item</div>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Google Business Profile claimed" aria-label="New item label" />
              <Input value={detailLabel} onChange={(e) => setDetailLabel(e.target.value)} placeholder="Detail field label (optional, e.g. Profile URL)" aria-label="New item detail label" />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={required} onCheckedChange={setRequired} /> Required for Live
                </label>
                <Button
                  size="sm"
                  disabled={pending || !label.trim()}
                  onClick={() =>
                    start(async () => {
                      const res = await addTemplateItem({ label, required, detailLabel });
                      if (res.ok) {
                        setLabel("");
                        setDetailLabel("");
                        setRequired(true);
                      } else toast.error(res.error);
                    })
                  }
                >
                  Add
                </Button>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await applyTemplateToAllBrands();
                  if (!res.ok) toast.error(res.error);
                  else toast.success(res.itemsAdded ? `Added ${res.itemsAdded} item(s) across ${res.brandsUpdated} brand(s)` : "Every brand already has every item");
                })
              }
            >
              Add new items to all existing brands
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TemplateRow({
  item,
  canManage,
  first,
  last,
  pending,
  run,
}: {
  item: ChecklistTemplateItem;
  canManage: boolean;
  first: boolean;
  last: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [label, setLabel] = useState(item.label);
  const dirty = label.trim() !== item.label;

  if (!canManage) {
    return (
      <li className={cn("px-3 py-2 text-sm", !item.active && "text-muted-foreground line-through")}>
        {item.label}
        {!item.required && <span className="ml-1 text-xs text-muted-foreground">(optional)</span>}
      </li>
    );
  }

  return (
    <li className={cn("flex flex-wrap items-center gap-2 px-3 py-2 text-sm", !item.active && "opacity-60")}>
      <div className="flex flex-col">
        <button type="button" disabled={first || pending} onClick={() => run(() => moveTemplateItem(item.id, "up"))} className="text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Move up">
          <ArrowUpIcon className="size-3.5" />
        </button>
        <button type="button" disabled={last || pending} onClick={() => run(() => moveTemplateItem(item.id, "down"))} className="text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Move down">
          <ArrowDownIcon className="size-3.5" />
        </button>
      </div>
      <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-8 min-w-48 flex-1" aria-label="Item label" />
      {dirty && (
        <Button size="sm" disabled={pending} onClick={() => run(() => updateTemplateItem(item.id, { label }))}>
          Save
        </Button>
      )}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Required before Live">
        <Switch checked={item.required} disabled={pending} onCheckedChange={(v) => run(() => updateTemplateItem(item.id, { required: v }))} /> Required
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Inactive items aren't added to new brands">
        <Switch checked={item.active} disabled={pending} onCheckedChange={(v) => run(() => updateTemplateItem(item.id, { active: v }))} /> Active
      </label>
    </li>
  );
}
