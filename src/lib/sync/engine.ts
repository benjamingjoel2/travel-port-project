import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { initializeBrandChildren } from "@/db/seed";
import { countryByCode } from "@/lib/countries";
import { slugify } from "@/lib/utils";
import { buildEvent, type DeployLike } from "@/lib/monitor-core";
import { detectCountryFromName, detectCountryFromText, detectCountryInName, humanize } from "./detect";
import { regionForCountry } from "./regions";
import type { GithubRepo, VercelProject } from "./sources";

export type SyncConfig = {
  vercelToken?: string;
  vercelTeamId?: string;
  githubOwner?: string;
  githubToken?: string;
  /** This tracker's own repo ("owner/repo") and Vercel project id, never added as a brand. */
  selfRepo?: string;
  selfProjectId?: string;
};

export type SyncDeps = {
  listVercelProjects: (token: string, teamId?: string) => Promise<{ projects: VercelProject[] }>;
  listGithubRepos: (owner: string, token?: string) => Promise<GithubRepo[]>;
  /** Recently updated repos via Vercel's GitHub connection (optional, no rate limit). */
  listRecentRepos?: (token: string, teamId?: string) => Promise<GithubRepo[]>;
  fetchRepoDocs: (fullName: string, token?: string) => Promise<string>;
  /** Text of a deployed site, for projects whose name and README don't say the country. */
  fetchSiteText?: (url: string) => Promise<string>;
};

export type SyncSummary = {
  at: string;
  ok: boolean;
  /** Another server instance was already syncing, so this run did nothing. */
  skipped?: boolean;
  error?: string;
  warnings: string[];
  added: string[];
  linked: string[];
  advanced: string[];
  queued: number;
  vercelProjects: number;
  githubRepos: number;
  durationMs: number;
};

/** Stages auto-sync may move forward out of. It never moves past Building on its own. */
const PRE_BUILD_STAGES = new Set(["idea", "named", "prompt_ready"]);

type Candidate = {
  key: string;
  kind: "vercel" | "github";
  rawName: string;
  repo: string | null;
  repoUrl: string | null;
  url: string | null;
  vercel?: VercelProject;
  github?: GithubRepo;
};

type BrandRow = schema.Brand & { stage: schema.PipelineStage };

function repoName(repo: string | null) {
  return repo ? repo.split("/")[1] : null;
}

function withProtocol(host: string | null) {
  return host ? (/^https?:\/\//.test(host) ? host : `https://${host}`) : null;
}

export async function runSync(db: Db, cfg: SyncConfig, deps: SyncDeps): Promise<SyncSummary> {
  const started = Date.now();
  const summary: SyncSummary = { at: new Date().toISOString(), ok: true, warnings: [], added: [], linked: [], advanced: [], queued: 0, vercelProjects: 0, githubRepos: 0, durationMs: 0 };
  const selfRepo = cfg.selfRepo?.toLowerCase();

  /* ---- gather ---- */
  let vercel: VercelProject[] = [];
  let github: GithubRepo[] = [];
  if (cfg.vercelToken) {
    try {
      vercel = (await deps.listVercelProjects(cfg.vercelToken, cfg.vercelTeamId)).projects;
    } catch (e) {
      summary.warnings.push(`Vercel: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // Recent repos through Vercel first: always available, and that's where new projects are.
  let recent: GithubRepo[] = [];
  if (cfg.vercelToken && deps.listRecentRepos) {
    try {
      recent = await deps.listRecentRepos(cfg.vercelToken, cfg.vercelTeamId);
    } catch (e) {
      summary.warnings.push(`Recent repos via Vercel: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const owner = cfg.githubOwner || vercel.find((p) => p.repo)?.repo?.split("/")[0] || recent[0]?.fullName.split("/")[0];
  if (owner) {
    try {
      github = await deps.listGithubRepos(owner, cfg.githubToken);
    } catch (e) {
      summary.warnings.push(`GitHub: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // Merge, keeping the full list's entry when a repo is in both; only this account's repos.
  const seen = new Set(github.map((g) => g.fullName));
  for (const r of recent) {
    if (seen.has(r.fullName)) continue;
    if (owner && !r.fullName.startsWith(`${owner.toLowerCase()}/`)) continue;
    github.push(r);
    seen.add(r.fullName);
  }
  summary.vercelProjects = vercel.length;
  summary.githubRepos = github.length;
  if (!vercel.length && !github.length && summary.warnings.length) {
    summary.ok = false;
    summary.error = summary.warnings.join("; ");
    summary.durationMs = Date.now() - started;
    return summary;
  }

  const candidates: Candidate[] = [];
  const reposOnVercel = new Set<string>();
  for (const p of vercel) {
    if (p.id === cfg.selfProjectId || (selfRepo && p.repo === selfRepo)) continue;
    if (p.repo) reposOnVercel.add(p.repo);
    candidates.push({ key: `vercel:${p.id}`, kind: "vercel", rawName: p.name, repo: p.repo, repoUrl: p.repoUrl, url: p.projectUrl, vercel: p });
  }
  const githubByRepo = new Map(github.map((g) => [g.fullName, g]));
  for (const c of candidates) if (c.repo && githubByRepo.has(c.repo)) c.github = githubByRepo.get(c.repo);
  for (const g of github) {
    if (g.fullName === selfRepo || reposOnVercel.has(g.fullName)) continue;
    candidates.push({ key: `github:${g.fullName}`, kind: "github", rawName: g.name, repo: g.fullName, repoUrl: g.htmlUrl, url: g.htmlUrl, github: g });
  }

  // One sync at a time across all server instances; a failure rolls the whole run back.
  await db.transaction(async (tx) => {
    // A run that is cut off mid-way must not hold the lock for ever: the database ends it after 2 idle minutes.
    await tx.execute(sql`set local idle_in_transaction_session_timeout = '120s'`);
    let locked = await trySyncLock(tx as unknown as Db);
    if (!locked && (await clearStaleSyncLock(tx as unknown as Db))) locked = await trySyncLock(tx as unknown as Db);
    if (!locked) {
      summary.skipped = true;
      return;
    }
    await applyCandidates(tx as unknown as Db, candidates, cfg, deps, summary);
  });

  summary.durationMs = Date.now() - started;
  return summary;
}

const SYNC_LOCK = 727102;

async function trySyncLock(db: Db): Promise<boolean> {
  const res = (await db.execute(sql`select pg_try_advisory_xact_lock(${SYNC_LOCK}) as locked`)) as unknown as { rows: { locked: boolean }[] };
  return Boolean(res.rows[0]?.locked);
}

/**
 * A sync whose server was stopped mid-run can leave its connection open, idle and still
 * holding the lock, so every later run is skipped and nothing new is ever added. End such a
 * connection (idle inside a transaction for 2+ minutes) so the sync can go ahead.
 */
async function clearStaleSyncLock(db: Db): Promise<boolean> {
  const res = (await db.execute(sql`
    select pg_terminate_backend(a.pid) as ended
    from pg_locks l join pg_stat_activity a on a.pid = l.pid
    where l.locktype = 'advisory' and l.objid = ${SYNC_LOCK} and l.granted
      and a.pid <> pg_backend_pid()
      and a.state in ('idle in transaction', 'idle in transaction (aborted)')
      and a.state_change < now() - interval '2 minutes'`)) as unknown as { rows: { ended: boolean }[] };
  if (!res.rows.some((r) => r.ended)) return false;
  // The lock is released as that connection closes.
  await db.execute(sql`select pg_sleep(0.5)`);
  return true;
}

async function applyCandidates(db: Db, candidates: Candidate[], cfg: SyncConfig, deps: SyncDeps, summary: SyncSummary) {
  /* ---- reference data ---- */
  const stages = await db.query.pipelineStages.findMany();
  const buildingStage = stages.find((s) => s.key === "building") ?? stages.filter((s) => !s.isTerminal).sort((a, b) => a.sortOrder - b.sortOrder)[0];
  const regions = await db.query.regions.findMany();
  const brands: BrandRow[] = await db.query.brands.findMany({ with: { stage: true } });
  const items = new Map((await db.query.syncItems.findMany()).map((i) => [i.key, i]));

  const regionId = async (db: Db, code: string | null) => {
    const name = regionForCountry(code);
    if (!name) return null;
    let r = regions.find((x) => x.name === name);
    if (!r) {
      [r] = await db
        .insert(schema.regions)
        .values({ name, sortOrder: Math.max(0, ...regions.map((x) => x.sortOrder)) + 10 })
        .returning();
      regions.push(r);
    }
    return r.id;
  };

  const uniqueSlug = (base: string) => {
    let slug = base || "brand";
    for (let i = 2; brands.some((b) => b.slug === slug); i++) slug = `${base}-${i}`;
    return slug;
  };

  const log = (db: Db, brandId: string, action: string, details: Record<string, unknown>) =>
    db.insert(schema.activityLog).values({ brandId, action, actorName: "Auto-sync", details });

  /* ---- process ---- */
  const applyCandidate = async (db: Db, c: Candidate) => {
    const existingItem = items.get(c.key);
    const now = new Date();
    if (existingItem?.status === "ignored") {
      await db.update(schema.syncItems).set({ lastSeenAt: now, name: humanize(c.rawName) }).where(eq(schema.syncItems.id, existingItem.id));
      return;
    }

    // 1. Find the brand this project belongs to.
    const slugCandidates = new Set([slugify(c.rawName), slugify(humanize(c.rawName))]);
    let brand =
      (c.vercel && brands.find((b) => b.vercelProjectId === c.vercel!.id)) ||
      (c.repo && brands.find((b) => b.githubRepo === c.repo)) ||
      (existingItem?.brandId && brands.find((b) => b.id === existingItem.brandId)) ||
      brands.find((b) => slugCandidates.has(b.slug) && !b.vercelProjectId && !b.githubRepo) ||
      (c.repo && brands.find((b) => b.repoUrl && b.repoUrl.toLowerCase().replace(/\/+$/, "").endsWith(`/${c.repo}`))) ||
      undefined;

    // 2. Work out the country (cheap checks first, README last and only once per project).
    let country =
      detectCountryFromName(repoName(c.repo)) ??
      detectCountryFromName(c.rawName) ??
      detectCountryInName(repoName(c.repo)) ??
      detectCountryInName(c.rawName) ??
      existingItem?.detectedCountryCode ??
      null;
    if (!country && !brand && !existingItem && c.repo) {
      country = detectCountryFromText(await deps.fetchRepoDocs(c.repo, cfg.githubToken));
    }
    // Still unknown (private repo, or a Vercel project with no repo): read the live site.
    const siteUrl = c.vercel ? (c.vercel.customDomain ? withProtocol(c.vercel.customDomain) : c.vercel.stagingUrl) : null;
    if (!country && !brand && !existingItem && siteUrl && deps.fetchSiteText) {
      country = detectCountryFromText(await deps.fetchSiteText(siteUrl));
    }
    if (!brand && country) {
      // A Vercel project joins the one brand in that country that has no Vercel project yet,
      // even if that brand came from a GitHub repo (e.g. "antarctica" repo + "seventh-continent" site).
      const sameCountry = brands.filter((b) => b.countryCode === country && !b.vercelProjectId && (c.vercel ? true : !b.githubRepo));
      if (sameCountry.length === 1) brand = sameCountry[0];
    }

    // 3. Create a brand when the country is known; otherwise queue for review.
    if (!brand && country) {
      const name = humanize(c.vercel?.name ?? c.rawName);
      const [row] = await db
        .insert(schema.brands)
        .values({
          name,
          slug: uniqueSlug(slugify(name)),
          brandType: "country",
          country: countryByCode(country)?.name ?? country,
          countryCode: country,
          marketsCovered: [countryByCode(country)?.name ?? country],
          regionId: await regionId(db, country),
          stageId: buildingStage.id,
          source: c.kind,
          designReference: "other",
        })
        .returning();
      await initializeBrandChildren(db, row.id);
      await log(db, row.id, "brand_created", { name, source: c.kind === "vercel" ? "Vercel" : "GitHub" });
      brand = { ...row, stage: buildingStage };
      brands.push(brand);
      summary.added.push(name);
    }

    if (!brand) {
      const values = { key: c.key, kind: c.kind, name: humanize(c.rawName), repo: c.repo, url: c.url, status: "pending", detectedCountryCode: null, lastSeenAt: now };
      if (existingItem) await db.update(schema.syncItems).set(values).where(eq(schema.syncItems.id, existingItem.id));
      else items.set(c.key, (await db.insert(schema.syncItems).values(values).returning())[0]);
      summary.queued++;
      return;
    }

    // 4. Link and fill gaps. Never overwrite what a person typed.
    const patch: Partial<schema.NewBrand> = {};
    // A brand auto-named after its repo ("Antarctica") takes the site's name ("Seventh Continent").
    const autoName = brand.githubRepo ? humanize(repoName(brand.githubRepo) ?? "") : null;
    if (c.vercel && brand.source === "github" && autoName && brand.name === autoName && humanize(c.vercel.name) !== autoName) {
      patch.name = humanize(c.vercel.name);
      patch.slug = uniqueSlug(slugify(patch.name));
    }
    const wasLinked = Boolean(brand.vercelProjectId || brand.githubRepo);
    if (c.vercel && !brand.vercelProjectId && !brands.some((b) => b.vercelProjectId === c.vercel!.id)) patch.vercelProjectId = c.vercel.id;
    if (c.repo && !brand.githubRepo && !brands.some((b) => b.githubRepo === c.repo)) patch.githubRepo = c.repo;
    if (!brand.repoUrl && c.repoUrl) patch.repoUrl = c.repoUrl;
    if (c.vercel) {
      if (!brand.vercelProjectUrl) patch.vercelProjectUrl = c.vercel.projectUrl;
      if (!brand.stagingUrl && c.vercel.stagingUrl) patch.stagingUrl = c.vercel.stagingUrl;
      if (!brand.productionDomain && c.vercel.customDomain) patch.productionDomain = withProtocol(c.vercel.customDomain);
    }
    if (!brand.countryCode && country && brand.brandType === "country") {
      patch.countryCode = country;
      if (!brand.regionId) patch.regionId = await regionId(db, country);
      if (brand.marketsCovered.length === 0) patch.marketsCovered = [countryByCode(country)?.name ?? country];
    }
    const hasActivity = Boolean(c.vercel?.latest || c.github?.pushedAt);
    if (hasActivity && PRE_BUILD_STAGES.has(brand.stage.key) && buildingStage && brand.stage.id !== buildingStage.id) {
      patch.stageId = buildingStage.id;
      await log(db, brand.id, "status_changed", { from: brand.stage.name, to: buildingStage.name, reason: "build activity detected" });
      summary.advanced.push(brand.name);
    }
    if (Object.keys(patch).length) {
      await db.update(schema.brands).set({ ...patch, updatedAt: now }).where(eq(schema.brands.id, brand.id));
      Object.assign(brand, patch);
      if (patch.stageId) brand.stage = buildingStage;
      if (!wasLinked && (patch.vercelProjectId || patch.githubRepo) && !summary.added.includes(brand.name)) summary.linked.push(brand.name);
    }

    // 5. Latest deploy / push info.
    if (c.vercel) {
      // A newly failed build (or the fix after one) goes to everyone's notifications.
      const prevVercel = await db.query.integrationSnapshots.findFirst({
        where: and(eq(schema.integrationSnapshots.brandId, brand.id), eq(schema.integrationSnapshots.kind, "vercel")),
      });
      const build = buildEvent((prevVercel?.data as { latest?: DeployLike } | undefined)?.latest, c.vercel.latest);
      if (build) await log(db, brand.id, build.action, build.details);
      await upsertSnapshot(db, brand.id, "vercel", { production: c.vercel.production, latest: c.vercel.latest, customDomain: c.vercel.customDomain, stagingUrl: c.vercel.stagingUrl, projectUrl: c.vercel.projectUrl });
    }
    if (c.github) {
      await upsertSnapshot(db, brand.id, "github", { pushedAt: c.github.pushedAt, htmlUrl: c.github.htmlUrl, private: c.github.private });
    }

    const itemValues = { key: c.key, kind: c.kind, name: humanize(c.rawName), repo: c.repo, url: c.url, status: "linked", brandId: brand.id, detectedCountryCode: country, lastSeenAt: now };
    if (existingItem) await db.update(schema.syncItems).set(itemValues).where(eq(schema.syncItems.id, existingItem.id));
    else items.set(c.key, (await db.insert(schema.syncItems).values(itemValues).returning())[0]);
  };

  // Each project runs in its own savepoint: one that fails is skipped with a warning
  // instead of rolling back (and, run after run, blocking) every other project.
  for (const c of candidates) {
    const before = { brands: brands.length, hadItem: items.has(c.key), added: summary.added.length, linked: summary.linked.length, advanced: summary.advanced.length, queued: summary.queued };
    try {
      await db.transaction((tx) => applyCandidate(tx as unknown as Db, c));
    } catch (e) {
      brands.length = before.brands;
      if (!before.hadItem) items.delete(c.key);
      summary.added.length = before.added;
      summary.linked.length = before.linked;
      summary.advanced.length = before.advanced;
      summary.queued = before.queued;
      const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : e instanceof Error ? e.message : String(e);
      summary.warnings.push(`${humanize(c.rawName)}: ${cause.slice(0, 200)}`);
    }
  }
}

async function upsertSnapshot(db: Db, brandId: string, kind: string, data: Record<string, unknown>) {
  await db
    .insert(schema.integrationSnapshots)
    .values({ brandId, kind, data, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: [schema.integrationSnapshots.brandId, schema.integrationSnapshots.kind], set: { data, fetchedAt: new Date() } });
}
