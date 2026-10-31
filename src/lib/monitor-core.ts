/**
 * The rules behind site monitoring, kept free of the database so they can be tested:
 * what counts as up, when a down site is worth an alert, and when a build has broken.
 */

/** A site must fail this many checks in a row before anyone is alerted, so one slow answer doesn't page us. */
export const DOWN_AFTER = 2;
export const CHECK_TIMEOUT_MS = 10_000;

export type CheckResult = {
  ok: boolean;
  /** 401/403: the site answers but asks for a login (a protected Vercel preview). Counted as up. */
  locked?: boolean;
  status: number | null;
  ms: number | null;
  error: string | null;
};

/** Stored per brand as its "uptime" integration snapshot. */
export type UptimeSnapshot = CheckResult & {
  url: string;
  checkedAt: string;
  /** Failed checks in a row. */
  fails: number;
  downSince: string | null;
  lastOkAt: string | null;
  /** A "site down" alert went out and no "back up" has followed yet. */
  alerted: boolean;
};

export type UptimeEvent = { action: "site_down"; details: { url: string; error: string | null; status: number | null } } | { action: "site_up"; details: { url: string; downFor: string } };

/** Fetch a page and judge it. Redirects are followed; anything that answers under 400 is up. */
export async function checkUrl(url: string, fetchImpl: typeof fetch = fetch): Promise<CheckResult> {
  const started = Date.now();
  try {
    const res = await fetchImpl(url, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      headers: { "user-agent": "BuildTrackerMonitor/1.0 (+https://sitetracker.tourground.com)" },
    });
    const ms = Date.now() - started;
    await res.body?.cancel().catch(() => {});
    if (res.status === 401 || res.status === 403) return { ok: true, locked: true, status: res.status, ms, error: null };
    return { ok: res.status < 400, status: res.status, ms, error: res.status < 400 ? null : `HTTP ${res.status}` };
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { ok: false, status: null, ms: null, error: timedOut ? `No answer within ${CHECK_TIMEOUT_MS / 1000} s` : e instanceof Error ? e.message : String(e) };
  }
}

/** "3 h 20 min" from two ISO times. */
export function duration(fromIso: string, toIso: string): string {
  const mins = Math.max(1, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h < 48 ? `${h} h${m ? ` ${m} min` : ""}` : `${Math.round(h / 24)} days`;
}

/** Fold a new check into the stored state; returns an alert when the site has just gone down or come back. */
export function nextUptime(prev: UptimeSnapshot | null, url: string, result: CheckResult, now: string): { snap: UptimeSnapshot; event: UptimeEvent | null } {
  // A new address starts a fresh history.
  const before = prev && prev.url === url ? prev : null;
  const fails = result.ok ? 0 : (before?.fails ?? 0) + 1;
  const downSince = result.ok ? null : (before?.downSince ?? now);
  let alerted = before?.alerted ?? false;
  let event: UptimeEvent | null = null;
  if (!result.ok && fails >= DOWN_AFTER && !alerted) {
    alerted = true;
    event = { action: "site_down", details: { url, error: result.error, status: result.status } };
  } else if (result.ok && alerted) {
    alerted = false;
    event = { action: "site_up", details: { url, downFor: duration(before?.downSince ?? now, now) } };
  }
  return {
    snap: { ...result, url, checkedAt: now, fails, downSince, lastOkAt: result.ok ? now : (before?.lastOkAt ?? null), alerted },
    event,
  };
}

export type DeployLike = { state?: string | null; commitSha?: string | null; commitMessage?: string | null; branch?: string | null; url?: string | null } | null | undefined;

/** Compare a project's newest deployment with the one seen last sync: a fresh failure, or a fix after one. */
export function buildEvent(prev: DeployLike, next: DeployLike): { action: "build_failed" | "build_fixed"; details: Record<string, string | null> } | null {
  if (!next?.state) return null;
  const details = { branch: next.branch ?? null, commit: next.commitMessage ?? null, url: next.url ?? null };
  if (next.state === "ERROR" && !(prev?.state === "ERROR" && prev.commitSha === next.commitSha)) return { action: "build_failed", details };
  if (next.state === "READY" && prev?.state === "ERROR") return { action: "build_fixed", details };
  return null;
}
