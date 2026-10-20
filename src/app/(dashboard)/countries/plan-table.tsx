"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
import type { PlannedRow } from "@/lib/data/countries";
import { addPlannedCountry, removePlannedCountry, updatePlannedCountry } from "@/lib/actions/countries";
import { PLANNED_STATUSES, PLANNED_STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StageBadge } from "@/components/stage-badge";
import { CountryCombobox } from "@/components/country-combobox";

type Result = { ok: true } | { ok: false; error: string };

export function PlanTable({ rows, editable }: { rows: PlannedRow[]; editable: boolean }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) after?.();
      else toast.error(res.error);
    });

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Wave</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Why</TableHead>
              <TableHead>Status</TableHead>
              {editable && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={editable ? 7 : 6} className="py-8 text-center text-muted-foreground">
                  Nothing planned yet. Add a country below.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r, i) => (
              <TableRow key={r.id} className={cn(r.status === "skipped" && !r.countryBrand && "text-muted-foreground")}>
                <TableCell className="tabular-nums text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-medium">
                  {r.name}
                  {r.alsoIn.length > 0 && !r.countryBrand && <div className="text-xs font-normal text-muted-foreground">Sold by {r.alsoIn.map((b) => b.name).join(", ")}</div>}
                </TableCell>
                <TableCell>
                  {editable && !r.countryBrand ? (
                    <Select value={String(r.wave)} onValueChange={(v) => run(() => updatePlannedCountry(r.id, { wave: Number(v) }))} disabled={pending}>
                      <SelectTrigger className="h-8 w-16" aria-label={`Wave for ${r.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map((w) => (
                          <SelectItem key={w} value={String(w)}>
                            {w}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    r.wave
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{r.region ?? "—"}</TableCell>
                <TableCell className="min-w-48 max-w-72 whitespace-normal text-muted-foreground">{r.note ?? "—"}</TableCell>
                <TableCell>
                  {r.countryBrand ? (
                    <Link href={`/brands/${r.countryBrand.slug}`} className="inline-flex items-center gap-2 hover:underline">
                      <StageBadge stage={r.countryBrand.stage} />
                      <span className="text-xs text-muted-foreground">{r.countryBrand.name}</span>
                    </Link>
                  ) : editable ? (
                    <Select value={r.status} onValueChange={(v) => run(() => updatePlannedCountry(r.id, { status: v as PlannedRow["status"] }))} disabled={pending}>
                      <SelectTrigger className="h-8 w-32" aria-label={`Status for ${r.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLANNED_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {PLANNED_STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    PLANNED_STATUS_LABELS[r.status]
                  )}
                </TableCell>
                {editable && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${r.name} from the plan`}
                      disabled={pending}
                      onClick={() => {
                        if (confirm(`Remove ${r.name} from the plan?`)) run(() => removePlannedCountry(r.id));
                      }}
                    >
                      <Trash2Icon />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editable && <AddCountry pending={pending} run={run} />}
    </div>
  );
}

function AddCountry({ pending, run }: { pending: boolean; run: (fn: () => Promise<Result>, after?: () => void) => void }) {
  const [code, setCode] = useState("");
  const [wave, setWave] = useState("1");
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-60">
        <div className="mb-1 text-xs text-muted-foreground">Add a country</div>
        <CountryCombobox value={code} onChange={(c) => setCode(c)} />
      </div>
      <div>
        <div className="mb-1 text-xs text-muted-foreground">Wave</div>
        <Select value={wave} onValueChange={setWave}>
          <SelectTrigger className="w-16" aria-label="Wave">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5].map((w) => (
              <SelectItem key={w} value={String(w)}>
                {w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-48 flex-1">
        <div className="mb-1 text-xs text-muted-foreground">Why (optional)</div>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Pairs with Peru" aria-label="Why" />
      </div>
      <Button
        disabled={pending || !code}
        onClick={() =>
          run(
            () => addPlannedCountry({ countryCode: code, wave: Number(wave), note }),
            () => {
              setCode("");
              setNote("");
            },
          )
        }
      >
        Add to plan
      </Button>
    </div>
  );
}
