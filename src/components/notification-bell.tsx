"use client";

import Link from "next/link";
import { useState } from "react";
import { BellIcon } from "lucide-react";
import type { ActivityEntry } from "@/db/schema";
import { markNotificationsSeen } from "@/lib/actions/notifications";
import { cn, timeAgo } from "@/lib/utils";
import { describe } from "@/components/activity-list";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Item = Pick<ActivityEntry, "id" | "action" | "details" | "actorName" | "createdAt"> & { brand: { name: string; slug: string } };

function href(item: Item) {
  const d = (item.details ?? {}) as { noteId?: string };
  if (item.action.startsWith("note_")) return `/brands/${item.brand.slug}?tab=notes${d.noteId ? `#comment-${d.noteId}` : ""}`;
  if (item.action.startsWith("blocker_")) return `/brands/${item.brand.slug}?tab=notes`;
  return `/brands/${item.brand.slug}`;
}

export function NotificationBell({ items, unread, seenAt }: { items: Item[]; unread: number; seenAt: Date }) {
  const [open, setOpen] = useState(false);
  // When the menu was last opened here; the server's seenAt catches up on the next refresh.
  const [openedAt, setOpenedAt] = useState<Date | null>(null);
  // While the menu is open, items newer than this stay highlighted.
  const [highlightFrom, setHighlightFrom] = useState<Date>(new Date(seenAt));
  const localAhead = openedAt !== null && openedAt > new Date(seenAt);
  const effectiveSeen = localAhead ? openedAt : new Date(seenAt);
  const count = localAhead ? items.filter((i) => new Date(i.createdAt) > openedAt).length : unread;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setHighlightFrom(effectiveSeen);
      setOpenedAt(new Date());
      if (count > 0) void markNotificationsSeen();
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}>
          <BellIcon />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white tabular-nums">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] max-w-[calc(100vw-1rem)]">
        <div className="border-b px-3 py-2 text-sm font-semibold">Notifications</div>
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing yet. Comments, blockers and stage changes from the team show up here.</p>
        ) : (
          <ul className="max-h-[26rem] divide-y overflow-y-auto">
            {items.map((item) => {
              const isNew = new Date(item.createdAt) > highlightFrom;
              return (
                <li key={item.id}>
                  <Link href={href(item)} onClick={() => onOpenChange(false)} className={cn("flex gap-2.5 px-3 py-2.5 text-sm hover:bg-accent", isNew && "bg-primary/5")}>
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", isNew ? "bg-destructive" : "bg-transparent")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-3">
                        <span className="font-medium">{item.actorName ?? "Someone"}</span>{" "}
                        {item.action === "brand_created" && item.actorName === "Auto-sync" ? "found a new project" : describe(item)}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {item.brand.name} · {timeAgo(new Date(item.createdAt))}
                      </span>
                    </span>
                    {isNew && <span className="sr-only">New</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
