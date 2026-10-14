import Link from "next/link";
import { AlertTriangleIcon, ClockIcon } from "lucide-react";
import { listBrands, getOpenBlockers } from "@/lib/data/brands";
import { getStages, getRegions } from "@/lib/data/reference";
import { GOAL_BRAND_COUNT, WAITING_ON_LABELS } from "@/lib/constants";
import { daysUntil, formatDate, timeAgo } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StageBadge } from "@/components/stage-badge";
import { BrandLogo } from "@/components/brand-logo";
import { WorldMap } from "@/components/world-map";
import { buildCountryShading } from "@/lib/geo";
import { getSyncState, isSyncConfigured } from "@/lib/sync";

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const [brands, stages, regions, blockers, sync] = await Promise.all([listBrands(), getStages(), getRegions(), getOpenBlockers(), getSyncState()]);
  const syncNote = isSyncConfigured() ? (sync.last ? ` Synced with Vercel and GitHub ${timeAgo(sync.last.at)}.` : " Syncing with Vercel and GitHub…") : "";
  const live = brands.filter((b) => b.stage.countsAsLive).length;
  const byStage = stages.map((s) => ({ stage: s, count: brands.filter((b) => b.stageId === s.id).length }));
  const byRegion = [...regions.map((r) => ({ name: r.name, count: brands.filter((b) => b.regionId === r.id).length })), { name: "No region", count: brands.filter((b) => !b.regionId).length }].filter((r) => r.count > 0);
  const recent = [...brands].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 8);
  const shading = buildCountryShading(brands);
  const overdue = brands.filter((b) => b.targetLaunchDate && !b.stage.countsAsLive && !b.stage.isTerminal && (daysUntil(b.targetLaunchDate) ?? 1) < 0);

  return (
    <>
      <PageHeader title="Overview" description={`Where the portfolio stands today.${syncNote}`} />

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-semibold tabular-nums">
                {live} <span className="text-lg font-normal text-muted-foreground">/ {GOAL_BRAND_COUNT} brands live</span>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{brands.length} brands in the tracker</div>
            </div>
            <div className="text-sm text-muted-foreground tabular-nums">{Math.round((live / GOAL_BRAND_COUNT) * 100)}%</div>
          </div>
          <Progress value={live} max={GOAL_BRAND_COUNT} className="h-3" indicatorClassName="bg-success" />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>World map</CardTitle>
        </CardHeader>
        <CardContent>
          <WorldMap shading={shading} stages={stages.filter((s) => !s.isTerminal)} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {byStage.map(({ stage, count }) => (
              <Link key={stage.id} href={`/brands?stage=${stage.key}`} className="flex items-center justify-between rounded-md px-1 py-0.5 text-sm hover:bg-accent">
                <StageBadge stage={stage} className="border-transparent px-0" />
                <span className="tabular-nums text-muted-foreground">{count}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By region</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {byRegion.length === 0 && <p className="text-sm text-muted-foreground">No brands yet.</p>}
            {byRegion.map((r) => (
              <div key={r.name} className="text-sm">
                <div className="flex items-center justify-between">
                  <span>{r.name}</span>
                  <span className="tabular-nums text-muted-foreground">{r.count}</span>
                </div>
                <Progress value={r.count} max={brands.length || 1} className="mt-1 h-1.5" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangleIcon className="size-4 text-destructive" /> Open blockers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {blockers.length === 0 && <p className="text-sm text-muted-foreground">Nothing is blocked. Nice.</p>}
            {blockers.slice(0, 8).map((b) => (
              <div key={b.id} className="text-sm">
                <Link href={`/brands/${b.brand.slug}`} className="font-medium hover:underline">
                  {b.brand.name}
                </Link>
                <div className="text-muted-foreground">{b.description}</div>
                <div className="text-xs text-muted-foreground">
                  Waiting on {WAITING_ON_LABELS[b.waitingOn]} · opened {timeAgo(b.openedAt)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recently updated</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {recent.map((b) => (
              <Link key={b.id} href={`/brands/${b.slug}`} className="flex items-center gap-3 py-2 text-sm hover:bg-accent/50">
                <BrandLogo name={b.name} logoUrl={b.logoUrl} logoData={b.logoData} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{b.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{b.country}</div>
                </div>
                <StageBadge stage={b.stage} />
                <span className="w-16 text-right text-xs text-muted-foreground">{timeAgo(b.updatedAt)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClockIcon className="size-4" /> Past target date
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdue.length === 0 && <p className="text-sm text-muted-foreground">No brands are past their target launch date.</p>}
            {overdue.map((b) => (
              <Link key={b.id} href={`/brands/${b.slug}`} className="flex items-center justify-between text-sm hover:underline">
                <span>{b.name}</span>
                <span className="text-xs text-destructive">{formatDate(b.targetLaunchDate)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
