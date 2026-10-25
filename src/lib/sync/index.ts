import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appState } from "@/db/schema";
import { runSync, type SyncConfig, type SyncSummary } from "./engine";
import { fetchRepoDocs, fetchSiteText, listAllReposViaVercel, listGithubRepos, listRecentReposViaVercel, listVercelProjects, type GithubRepo } from "./sources";

const STATE_KEY = "sync";
/** Pages trigger a background sync when the last one is older than this. */
export const SYNC_INTERVAL_MS = 60 * 1000;

export function getSyncConfig(): SyncConfig {
  const env = process.env;
  return {
    vercelToken: env.VERCEL_TOKEN || undefined,
    vercelTeamId: env.VERCEL_TEAM_ID || undefined,
    githubOwner: env.GITHUB_OWNER || undefined,
    githubToken: env.GITHUB_TOKEN || undefined,
    selfRepo: env.VERCEL_GIT_REPO_OWNER && env.VERCEL_GIT_REPO_SLUG ? `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}` : env.SELF_REPO || undefined,
    selfProjectId: env.VERCEL_PROJECT_ID || undefined,
  };
}

export function isSyncConfigured(cfg = getSyncConfig()) {
  return Boolean(cfg.vercelToken || cfg.githubOwner);
}

type StoredState = {
  lastAttemptAt?: string;
  last?: SyncSummary;
  /** Set when a run found another one holding the lock; cleared by the next completed run. */
  skippedSince?: string;
};

const REPO_CACHE_KEY = "github_repos";
/** The full GitHub repo list is fetched at most this often; recent repos come from Vercel every run. */
const FULL_REPO_LIST_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Full repo listing, cached for 30 minutes. With a GITHUB_TOKEN it comes from GitHub;
 * otherwise from Vercel's GitHub connection, which also sees private repos. If the
 * fetch fails, the last good list is used instead.
 */
async function listGithubReposCached(owner: string, token?: string): Promise<GithubRepo[]> {
  const db = await getDb();
  const row = await db.query.appState.findFirst({ where: eq(appState.key, REPO_CACHE_KEY) });
  const cached = row?.value as { at?: string; owner?: string; repos?: GithubRepo[] } | undefined;
  const fresh = cached?.at && cached.owner === owner && Date.now() - Date.parse(cached.at) < FULL_REPO_LIST_INTERVAL_MS;
  if (fresh && cached?.repos) return cached.repos;
  try {
    const cfg = getSyncConfig();
    const repos = token || !cfg.vercelToken ? await listGithubRepos(owner, token) : await listAllReposViaVercel(cfg.vercelToken, cfg.vercelTeamId);
    const value = { at: new Date().toISOString(), owner, repos };
    await db
      .insert(appState)
      .values({ key: REPO_CACHE_KEY, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appState.key, set: { value, updatedAt: new Date() } });
    return repos;
  } catch (e) {
    if (cached?.repos && cached.owner === owner) return cached.repos;
    throw e;
  }
}

export type SyncState = StoredState;

export async function getSyncState(): Promise<StoredState> {
  const db = await getDb();
  const row = await db.query.appState.findFirst({ where: eq(appState.key, STATE_KEY) });
  return (row?.value as StoredState | undefined) ?? {};
}

async function saveState(patch: StoredState) {
  const db = await getDb();
  const value = { ...(await getSyncState()), ...patch };
  await db
    .insert(appState)
    .values({ key: STATE_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appState.key, set: { value, updatedAt: new Date() } });
}

let running: Promise<SyncSummary> | null = null;

/** Run a sync now (one at a time per server instance). */
export async function syncNow(): Promise<SyncSummary> {
  if (running) return running;
  running = (async () => {
    await saveState({ lastAttemptAt: new Date().toISOString() });
    const db = await getDb();
    let summary: SyncSummary;
    try {
      summary = await runSync(db, getSyncConfig(), { listVercelProjects, listGithubRepos: listGithubReposCached, listRecentRepos: listRecentReposViaVercel, fetchRepoDocs, fetchSiteText });
    } catch (e) {
      summary = { at: new Date().toISOString(), ok: false, error: e instanceof Error ? e.message : String(e), warnings: [], added: [], linked: [], advanced: [], queued: 0, vercelProjects: 0, githubRepos: 0, durationMs: 0 };
    }
    // One line per run so Vercel's logs show what auto-sync is doing.
    console.log(
      `[auto-sync] ${summary.skipped ? "skipped (another run in progress)" : summary.ok ? "ok" : "FAILED"} vercel=${summary.vercelProjects} repos=${summary.githubRepos} added=[${summary.added.join(", ")}] linked=[${summary.linked.join(", ")}] queued=${summary.queued}${summary.warnings.length ? ` warnings=${summary.warnings.join(" | ")}` : ""}${summary.error ? ` error=${summary.error}` : ""} ${summary.durationMs}ms`,
    );
    // A skipped run means another instance is syncing right now; keep its result, but note
    // when skipping started so a lock that never frees shows up on the Overview.
    if (!summary.skipped) await saveState({ last: summary, skippedSince: undefined });
    else {
      const state = await getSyncState();
      if (!state.skippedSince) await saveState({ skippedSince: summary.at });
    }
    return summary;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Sync if configured and the last attempt is stale. Safe to call on every page view. */
export async function maybeSync(): Promise<void> {
  if (!isSyncConfigured()) return;
  // Never sync while Next is building: it would hit the live database and mark a run as done.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const state = await getSyncState();
  const last = state.lastAttemptAt ? Date.parse(state.lastAttemptAt) : 0;
  if (Date.now() - last < SYNC_INTERVAL_MS) return;
  await syncNow();
}

export type SyncHealth = { tone: "ok" | "warn" | "error"; text: string };

/** One line on how auto-sync is doing, for the Overview header. */
export function syncHealth(state: StoredState, now = Date.now()): SyncHealth | null {
  if (!isSyncConfigured()) return null;
  const last = state.last;
  if (!last) return { tone: "ok", text: "Syncing with Vercel and GitHub…" };
  const lastAt = Date.parse(last.at);
  const stuckFor = state.skippedSince ? now - Date.parse(state.skippedSince) : 0;
  if (stuckFor > 10 * 60 * 1000) return { tone: "error", text: `Auto-sync is stuck: no run has finished since ${new Date(lastAt).toUTCString()}. See Settings.` };
  if (!last.ok) return { tone: "error", text: `Auto-sync failed: ${last.error ?? "unknown error"}. See Settings.` };
  if (last.warnings.length) return { tone: "warn", text: `Auto-sync skipped ${last.warnings.length} project${last.warnings.length === 1 ? "" : "s"} with problems. See Settings.` };
  return { tone: "ok", text: "" };
}
