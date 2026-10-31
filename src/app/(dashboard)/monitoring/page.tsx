import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";
import { ensureFreshData } from "@/lib/sync/fresh";
import { getMonitorRows, getMonitorState, isDown, type MonitorRow } from "@/lib/monitor";
import { duration } from "@/lib/monitor-core";
import { hostOf } from "@/lib/progress";
import { timeAgo } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckNow } from "./check-now";

export const metadata = { title: "Monitoring" };

type Tone = "bad" | "warn" | "good" | "quiet";
const TONES: Record<Tone, string> = {
  bad: "bg-destructive/15 text-destructive",
  warn: "bg-warning/15 text-warning",
  good: "bg-success/15 text-success",
  quiet: "bg-muted text-muted-foreground",
};

function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-[3px] px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>{children}</span>;
}

function siteStatus(r: MonitorRow): { tone: Tone; label: string } {
  const u = r.uptime;
  if (!r.url) return { tone: "quiet", label: "No site yet" };
  if (!u || u.url !== r.url) return { tone: "quiet", label: "Not checked yet" };
  if (isDown(u)) return { tone: "bad", label: "Down" };
  if (!u.ok) return { tone: "warn", label: "Failed once" };
  if (u.locked) return { tone: "quiet", label: "Up, login wall" };
  return { tone: "good", label: "Up" };
}

function buildStatus(r: MonitorRow): { tone: Tone; label: string } {
  const s = r.build?.state;
  if (!s) return { tone: "quiet", label: "No builds" };
  if (s === "ERROR") return { tone: "bad", label: "Failed" };
  if (s === "READY") return { tone: "good", label: "Ready" };
  if (s === "CANCELED") return { tone: "quiet", label: "Canceled" };
  return { tone: "warn", label: "Building" };
}

export default async function MonitoringPage() {
  await ensureFreshData();
  const [rows, state] = await Promise.all([getMonitorRows(), getMonitorState()]);
  const now = new Date().toISOString();
  const checked = rows.filter((r) => r.url && r.uptime?.url === r.url);
  const down = checked.filter((r) => isDown(r.uptime)).length;
  const up = checked.filter((r) => r.uptime?.ok).length;
  const failing = rows.filter((r) => r.build?.state === "ERROR").length;
  const last = state.last;

  return (
    <>
      <PageHeader
        title="Monitoring"
        description={
          <>
            Every live site and test link is checked about every 10 minutes. A site down for two checks in a row, or a failed build, also shows in the bell.
            {last ? ` Last check ${timeAgo(new Date(last.at))}: ${last.checked} sites in ${Math.round(last.durationMs / 1000)} s.` : " No check has run yet."}
          </>
        }
        actions={<CheckNow />}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Sites up" value={up} of={checked.length || undefined} note="answering normally" />
        <StatCard label="Sites down" value={down} note={down ? "failed two checks in a row" : "nothing down"} />
        <StatCard label="Builds failing" value={failing} note="newest Vercel build failed" />
        <StatCard label="Not checked" value={rows.length - checked.length} note="no site yet, or waiting for a check" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Every site</CardTitle>
          <CardDescription>Down sites and failed builds first. A login wall means a protected Vercel preview: it answers, so it counts as up.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brand</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Site</TableHead>
                <TableHead className="text-right">Response</TableHead>
                <TableHead>Last check</TableHead>
                <TableHead>Newest build</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const site = siteStatus(r);
                const build = buildStatus(r);
                const u = r.uptime && r.uptime.url === r.url ? r.uptime : null;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/brands/${r.slug}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 truncate text-muted-foreground hover:text-foreground">
                          {hostOf(r.url)} <ArrowUpRightIcon className="size-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip tone={site.tone}>{site.label}</Chip>
                      {u && !u.ok && <div className="mt-1 text-xs text-muted-foreground">{u.error}{u.downSince ? ` · for ${duration(u.downSince, now)}` : ""}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{u?.ms != null ? `${u.ms} ms` : "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{u ? timeAgo(new Date(u.checkedAt)) : "—"}</TableCell>
                    <TableCell>
                      <Chip tone={build.tone}>{build.label}</Chip>
                      {r.build?.state === "ERROR" && r.build.commitMessage && <div className="mt-1 max-w-[240px] truncate text-xs text-muted-foreground">“{r.build.commitMessage}”</div>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
