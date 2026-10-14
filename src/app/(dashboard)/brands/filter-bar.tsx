"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import type { PipelineStage, Region, TeamMember } from "@/db/schema";
import type { BrandFilters } from "@/lib/data/brands";
import { PRIORITIES, PRIORITY_LABELS } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "__all";

export function BrandFilterBar({ stages, regions, members, current }: { stages: PipelineStage[]; regions: Region[]; members: TeamMember[]; current: BrandFilters }) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState(current.q ?? "");

  const apply = (patch: Partial<BrandFilters>) => {
    const next = { ...current, ...patch };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (!v || v === ALL) continue;
      if (k === "sort" && v === "updated") continue;
      if (k === "dir" && v === "asc") continue;
      params.set(k, v);
    }
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  };

  // Debounced search.
  useEffect(() => {
    if ((current.q ?? "") === q) return;
    const t = setTimeout(() => apply({ q: q || undefined }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilters = Boolean(current.q || current.stage || current.region || current.owner || current.priority);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or country" className="w-56 pl-8" />
      </div>
      <Select value={current.stage ?? ALL} onValueChange={(v) => apply({ stage: v === ALL ? undefined : v })}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Stage" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All stages</SelectItem>
          {stages.map((s) => (
            <SelectItem key={s.id} value={s.key}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={current.region ?? ALL} onValueChange={(v) => apply({ region: v === ALL ? undefined : v })}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Region" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All regions</SelectItem>
          {regions.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={current.owner ?? ALL} onValueChange={(v) => apply({ owner: v === ALL ? undefined : v })}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Owner" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any owner</SelectItem>
          <SelectItem value="none">Unassigned</SelectItem>
          {members.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={current.priority ?? ALL} onValueChange={(v) => apply({ priority: v === ALL ? undefined : v })}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any priority</SelectItem>
          {PRIORITIES.map((p) => (
            <SelectItem key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            startTransition(() => router.replace(pathname));
          }}
        >
          <XIcon /> Clear
        </Button>
      )}
    </div>
  );
}
