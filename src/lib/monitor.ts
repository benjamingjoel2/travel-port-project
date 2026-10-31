import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { activityLog, appState, integrationSnapshots } from "@/db/schema";
import { siteLevel } from "@/lib/site-level";
import { DOWN_AFTER, checkUrl, nextUptime, type DeployLike, type UptimeSnapshot } from "./monitor-core";

const STATE_KEY = "monitor";
/**
 * A run is skipped when the last one started less than this long ago. The GitHub Actions
 * schedule (.github/workflows/monitor.yml) calls every 10 minutes; tracker visits fill gaps.
 */
export const MONITOR_INTERVAL_MS = 8 * 60 * 1000;
const CONCURRENCY = 12;

export type MonitorState = { lastRunAt?: string; last?: { at: string; checked: number; down: number; locked: number; durationMs: number } };

export async function getMonitorState(): Promise<MonitorState> {
  const db = await getDb();
  const row = await db.query.appState.findFirst({ where: eq(appState.key, STATE_KEY) });
  return (row?.value as MonitorState | undefined) ?? {};
}

async function saveState(db: Db, patch: MonitorState) {
  const value = { ...(await getMonitorState()), ...patch };
  await db
    .insert(appState)
    .values({ key: STATE_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appState.key, set: { value, updatedAt: new Date() } });
}

const withHttps = (u: string) => (/^https?:\/\//.test(u) ? u : `https://${u}`);

/** Every brand with a site to check: its live domain, or its Vercel test link. */
async function targets(db: Db) {
  const rows = await db.query.brands.findMany({ with: { stage: true } });
  return rows
    .filter((b) => b.stage.key !== "dropped")
    .map((b) => ({ brand: b, site: siteLevel(b) }))
    .filter((t) => (t.site.level === "live" || t.site.level === "preview") && t.site.url)
    .map((t) => ({ id: t.brand.id, name: t.brand.name, url: withHttps(t.site.url as string) }));
}

let running: Promise<MonitorState["last"]> | null = null;

/** Check every site now (one run at a time per server instance) and raise alerts for changes. */
export async function runMonitor(): Promise<MonitorState["last"]> {
  if (running) return running;
  running = (async () => {
    const db = await getDb();
    const started = new Date();
    await saveState(db, { lastRunAt: started.toISOString() });
    const list = await targets(db);
    const prevRows = list.length
      ? await db.query.integrationSnapshots.findMany({ where: and(eq(integrationSnapshots.kind, "uptime"), inArray(integrationSnapshots.brandId, list.map((t) => t.id))) })
      : [];
    const prev = new Map(prevRows.map((r) => [r.brandId, r.data as unknown as UptimeSnapshot]));

    let down = 0;
    let locked = 0;
    const queue = [...list];
    const worker = async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        const result = await checkUrl(t.url);
        const now = new Date().toISOString();
        const { snap, event } = nextUptime(prev.get(t.id) ?? null, t.url, result, now);
        if (!snap.ok && snap.fails >= DOWN_AFTER) down++;
        if (snap.locked) locked++;
        await db
          .insert(integrationSnapshots)
          .values({ brandId: t.id, kind: "uptime", data: snap, fetchedAt: new Date(now) })
          .onConflictDoUpdate({ target: [integrationSnapshots.brandId, integrationSnapshots.kind], set: { data: snap, fetchedAt: new Date(now) } });
        if (event) await db.insert(activityLog).values({ brandId: t.id, actorName: "Monitor", action: event.action, details: event.details });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));

    const last = { at: started.toISOString(), checked: list.length, down, locked, durationMs: Date.now() - started.getTime() };
    await saveState(db, { last });
    console.log(`[monitor] checked=${last.checked} down=${down} locked=${locked} ${last.durationMs}ms`);
    return last;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Run the checks when the last run is stale. Safe to call on every page view and from the public cron URL. */
export async function maybeMonitor(): Promise<boolean> {
  if (process.env.NEXT_PHASE === "phase-production-build") return false;
  const state = await getMonitorState();
  const last = state.lastRunAt ? Date.parse(state.lastRunAt) : 0;
  if (Date.now() - last < MONITOR_INTERVAL_MS) return false;
  await runMonitor();
  return true;
}

export type MonitorRow = {
  id: string;
  name: string;
  slug: string;
  url: string | null;
  uptime: UptimeSnapshot | null;
  build: DeployLike & { createdAt?: number | null };
};

/** Every brand with its last check and newest build, worst first, for the Monitoring page and the map. */
export async function getMonitorRows(): Promise<MonitorRow[]> {
  const db = await getDb();
  const rows = await db.query.brands.findMany({ with: { stage: true, snapshots: true } });
  const out: MonitorRow[] = rows
    .filter((b) => b.stage.key !== "dropped")
    .map((b) => {
      const snap = (kind: string) => b.snapshots.find((s) => s.kind === kind)?.data as Record<string, unknown> | undefined;
      const site = siteLevel(b);
      return {
        id: b.id,
        name: b.name,
        slug: b.slug,
        url: site.level === "live" || site.level === "preview" ? (site.url ? withHttps(site.url) : null) : null,
        uptime: (snap("uptime") as UptimeSnapshot | undefined) ?? null,
        build: (snap("vercel")?.latest as MonitorRow["build"]) ?? null,
      };
    });
  const rank = (r: MonitorRow) => (isDown(r.uptime) ? 0 : r.build?.state === "ERROR" ? 1 : r.uptime && !r.uptime.ok ? 2 : r.uptime ? 4 : r.url ? 3 : 5);
  return out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** Down for at least DOWN_AFTER checks in a row: the state that alerts. */
export const isDown = (u: UptimeSnapshot | null | undefined) => Boolean(u && !u.ok && u.fails >= DOWN_AFTER);
