import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appState } from "@/db/schema";
import { runSync, type SyncConfig, type SyncSummary } from "./engine";
import { fetchRepoDocs, listGithubRepos, listVercelProjects } from "./sources";

const STATE_KEY = "sync";
/** Pages trigger a background sync when the last one is older than this. */
export const SYNC_INTERVAL_MS = 10 * 60 * 1000;

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

type StoredState = { lastAttemptAt?: string; last?: SyncSummary };

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
      summary = await runSync(db, getSyncConfig(), { listVercelProjects, listGithubRepos, fetchRepoDocs });
    } catch (e) {
      summary = { at: new Date().toISOString(), ok: false, error: e instanceof Error ? e.message : String(e), warnings: [], added: [], linked: [], advanced: [], queued: 0, vercelProjects: 0, githubRepos: 0, durationMs: 0 };
    }
    await saveState({ last: summary });
    return summary;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Sync if configured and the last attempt is stale. Safe to call on every page view. */
export async function maybeSync(): Promise<void> {
  if (!isSyncConfigured()) return;
  const state = await getSyncState();
  const last = state.lastAttemptAt ? Date.parse(state.lastAttemptAt) : 0;
  if (Date.now() - last < SYNC_INTERVAL_MS) return;
  await syncNow();
}
