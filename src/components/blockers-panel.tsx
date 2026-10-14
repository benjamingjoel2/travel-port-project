"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { Blocker, WaitingOn } from "@/db/schema";
import { addBlocker, setBlockerResolved } from "@/lib/actions/blockers";
import { WAITING_ON_LABELS, WAITING_ON_OPTIONS } from "@/lib/constants";
import { formatDate, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function BlockersPanel({ brandId, blockers, editable }: { brandId: string; blockers: Blocker[]; editable: boolean }) {
  const [pending, start] = useTransition();
  const [description, setDescription] = useState("");
  const [waitingOn, setWaitingOn] = useState<WaitingOn>("me");
  const open = blockers.filter((b) => !b.resolvedAt).sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
  const resolved = blockers.filter((b) => b.resolvedAt);

  const submit = () =>
    start(async () => {
      const res = await addBlocker(brandId, { description, waitingOn });
      if (res.ok) setDescription("");
      else toast.error(res.error);
    });

  const toggle = (id: string, value: boolean) =>
    start(async () => {
      const res = await setBlockerResolved(id, value);
      if (!res.ok) toast.error(res.error);
    });

  return (
    <div className="space-y-4">
      {editable && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's blocking this brand?"
            onKeyDown={(e) => e.key === "Enter" && description.trim() && submit()}
            aria-label="Blocker description"
          />
          <Select value={waitingOn} onValueChange={(v) => setWaitingOn(v as WaitingOn)}>
            <SelectTrigger className="sm:w-44" aria-label="Waiting on">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WAITING_ON_OPTIONS.map((w) => (
                <SelectItem key={w} value={w}>
                  Waiting on {WAITING_ON_LABELS[w].toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={submit} disabled={pending || !description.trim()}>
            Add blocker
          </Button>
        </div>
      )}

      {open.length === 0 && <p className="text-sm text-muted-foreground">No open blockers.</p>}
      <ul className="space-y-2">
        {open.map((b) => (
          <li key={b.id} className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-destructive" />
            <div className="min-w-0 flex-1">
              <div>{b.description}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Waiting on {WAITING_ON_LABELS[b.waitingOn]} · opened {timeAgo(b.openedAt)}
              </div>
            </div>
            {editable && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => toggle(b.id, true)}>
                Resolve
              </Button>
            )}
          </li>
        ))}
      </ul>

      {resolved.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">{resolved.length} resolved</summary>
          <ul className="mt-2 space-y-2">
            {resolved.map((b) => (
              <li key={b.id} className="flex items-start gap-3 rounded-md border p-3 text-muted-foreground">
                <div className="min-w-0 flex-1">
                  <div className="line-through">{b.description}</div>
                  <div className="mt-0.5 text-xs">
                    {WAITING_ON_LABELS[b.waitingOn]} · {formatDate(b.openedAt)} to {formatDate(b.resolvedAt)}
                  </div>
                </div>
                {editable && (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => toggle(b.id, false)}>
                    Reopen
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
