import Link from "next/link";
import { AlertTriangleIcon, ClockIcon, MessageSquareIcon } from "lucide-react";
import { listBrands, getOpenBlockers, getOpenComments } from "@/lib/data/brands";
import { getStages, getRegions } from "@/lib/data/reference";
import { BRAND_TYPES, BRAND_TYPE_LABELS, GOAL_BRAND_COUNT, WAITING_ON_LABELS } from "@/lib/constants";
import { daysUntil, formatDate, timeAgo } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StageBadge } from "@/components/stage-badge";
import { BrandLogo } from "@/components/brand-logo";
import { WorldMap } from "@/components/world-map";
import { StatCard } from "@/components/stat-card";
import { progressShading, PROGRESS_LEGEND } from "@/lib/progress";
import { getMapData } from "@/lib/data/map";
import { getSyncState, isSyncConfigured, syncHealth } from "@/lib/sync";

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const [brands, stages, regions, blockers, sync, comments, map] = await Promise.all([listBrands(), getStages(), getRegions(), getOpenBlockers(), getSyncState(), getOpenComments(8), getMapData()]);
  const openCommentCount = brands.reduce((n, b) => n + b.openComments, 0);
  const syncNote = isSyncConfigured() ? (sync.last ? ` Synced with Vercel and GitHub ${timeAgo(sync.last.at)}.` : " Syncing with Vercel and GitHub…") : "";
  const health = syncHealth(sync);
  const live = brands.filter((b) => b.stage.countsAsLive).length;
  const byStage = stages.map((s) => ({ stage: s, count: brands.filter((b) => b.stageId === s.id).length }));
  const byRegion = [...regions.map((r) => ({ name: r.name, count: brands.filter((b) => b.regionId === r.id).length })), { name: "No region", count: brands.filter((b) => !b.regionId).length }].filter((r) => r.count > 0);
  const byType = BRAND_TYPES.map((t) => {
    const list = brands.filter((b) => b.brandType === t);
    return { type: t, count: list.length, live: list.filter((b) => b.stage.countsAsLive).length, markets: new Set(list.flatMap((b) => b.marketsCovered)).size };
  });
  const missingCountry = brands.filter((b) => b.brandType === "country" && !b.countryCode).length;
  const recent = [...brands].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 8);
  const shading = progressShading(map.countries);
  const overdue = brands.filter((b) => b.targetLaunchDate && !b.stage.countsAsLive && !b.stage.isTerminal && (daysUntil(b.targetLaunchDate) ?? 1) < 0);

  const countries = map.stats.countries;
  const eyebrow = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title="The Portfolio"
        description={
          <>
            {brands.length} brands across {countries} countries, {live} live.{syncNote}
            {health && health.tone !== "ok" && (
              <Link href="/settings" className={`ml-1 font-medium hover:underline ${health.tone === "error" ? "text-destructive" : "text-amber-700 dark:text-warning"}`}>
                {health.text}
              </Link>
            )}
          </>
        }
      />

      <Card className="mb-6 overflow-hidden pb-3">
        <CardHeader className="flex-row items-end justify-between">
          <div>
            <CardTitle className="text-xl">Where we are</CardTitle>
            <CardDescription className="mt-1">
              {countries} countries with a brand
              {missingCountry > 0 && ` · ${missingCountry} brand(s) have no country set`}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <WorldMap shading={shading} stages={PROGRESS_LEGEND} />
        </CardContent>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Brands" value={brands.length} of={GOAL_BRAND_COUNT} href="/brands" note={`${GOAL_BRAND_COUNT - brands.length > 0 ? GOAL_BRAND_COUNT - brands.length : 0} to go`} />
        <StatCard label="Countries" value={countries} href="/countries" note="with a brand" />
        <StatCard label="Live" value={live} href="/brands?stage=live" note={`${Math.round((live / GOAL_BRAND_COUNT) * 100)}% of the goal`} />
        <StatCard label="Open comments" value={openCommentCount} href="#comments" note={blockers.length ? `${blockers.length} blocker${blockers.length === 1 ? "" : "s"} open` : "no blockers"} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {byStage.map(({ stage, count }) => (
              <Link key={stage.id} href={`/brands?stage=${stage.key}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
                <span className="flex-1">{stage.name}</span>
                <span className="text-base font-semibold tabular-nums">{count}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By brand type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {byType.map((t) => (
              <Link key={t.type} href={`/brands?type=${t.type}`} className="flex items-baseline justify-between rounded-lg px-2 py-2 hover:bg-accent">
                <span>
                  <span className="text-sm">{BRAND_TYPE_LABELS[t.type]}</span>
                  <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                    {t.live} live
                    {t.type !== "country" && t.count > 0 && ` · ${t.markets} ${t.type === "niche" ? (t.markets === 1 ? "focus" : "focuses") : t.markets === 1 ? "market" : "markets"}`}
                  </span>
                </span>
                <span className="text-2xl font-semibold tabular-nums">{t.count}</span>
              </Link>
            ))}
            <div className="mt-4 border-t pt-4">
              <div className="mb-2 text-xs tracking-[0.12em] text-muted-foreground uppercase">By region</div>
              {byRegion.length === 0 && <p className="text-sm text-muted-foreground">No brands yet.</p>}
              <div className="space-y-2">
                {byRegion.map((r) => (
                  <div key={r.name} className="text-sm">
                    <div className="flex items-center justify-between">
                      <span>{r.name}</span>
                      <span className="tabular-nums text-muted-foreground">{r.count}</span>
                    </div>
                    <Progress value={r.count} max={brands.length || 1} className="mt-1 h-1" indicatorClassName="bg-terra" />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangleIcon className="size-4 text-destructive" /> Open blockers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {blockers.length === 0 && <p className="text-sm text-muted-foreground">Nothing is blocked. Nice.</p>}
            {blockers.slice(0, 8).map((b) => (
              <div key={b.id} className="border-l-2 border-destructive/40 pl-3 text-sm">
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

        <Card id="comments" className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquareIcon className="size-4 text-terra" /> Open comments
              {openCommentCount > 0 && <span className="rounded-full bg-terra px-2 font-sans text-xs leading-5 text-white tabular-nums">{openCommentCount}</span>}
            </CardTitle>
            <CardDescription>Comments on any brand that nobody has marked done yet.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {comments.length === 0 && <p className="text-sm text-muted-foreground">No open comments. Add one from a brand&apos;s Comments tab.</p>}
            {comments.map((c) => (
              <Link key={c.id} href={`/brands/${c.brand.slug}?tab=notes#comment-${c.id}`} className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-3 text-sm hover:bg-accent/60">
                <BrandLogo name={c.brand.name} logoUrl={c.brand.logoUrl} logoData={c.brand.logoData} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.brand.name}</span>
                    <span>
                      {c.author?.name ?? "Someone"} · {timeAgo(c.createdAt)}
                      {c.replies.length > 0 && ` · ${c.replies.length} repl${c.replies.length === 1 ? "y" : "ies"}`}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap">{c.body}</p>
                </div>
              </Link>
            ))}
            {openCommentCount > comments.length && <p className="pt-2 text-xs text-muted-foreground">+ {openCommentCount - comments.length} more on the brands&apos; Comments tabs</p>}
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

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Recently updated</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-8 divide-y sm:grid-cols-2 sm:divide-y-0">
            {recent.map((b) => (
              <Link key={b.id} href={`/brands/${b.slug}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-accent/60">
                <BrandLogo name={b.name} logoUrl={b.logoUrl} logoData={b.logoData} size={30} />
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
      </div>
    </>
  );
}
