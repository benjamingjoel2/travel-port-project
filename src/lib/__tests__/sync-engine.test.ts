import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import type { Db } from "@/db";
import { runSync, type SyncDeps } from "@/lib/sync/engine";
import type { DeployInfo, GithubRepo, VercelProject } from "@/lib/sync/sources";

const deploy = (msg: string): DeployInfo => ({ state: "READY", createdAt: Date.now(), url: "https://x.vercel.app", target: "production", branch: "main", commitMessage: msg, commitSha: "abc", commitAuthor: "Claude" });
const vp = (id: string, name: string, repo: string | null, customDomain: string | null = null): VercelProject => ({
  id,
  name,
  repo: repo ? `benjamingjoel2/${repo}`.toLowerCase() : null,
  repoUrl: repo ? `https://github.com/benjamingjoel2/${repo}` : null,
  projectUrl: `https://vercel.com/team/${name}`,
  stagingUrl: `https://${name}.vercel.app`,
  customDomain,
  production: deploy(`deploy ${name}`),
  latest: deploy(`latest ${name}`),
  createdAt: 1,
});
const gh = (name: string): GithubRepo => ({ fullName: `benjamingjoel2/${name}`.toLowerCase(), name, htmlUrl: `https://github.com/benjamingjoel2/${name}`, pushedAt: "2026-10-14T10:00:00Z", private: false });

// Mirrors the real Vercel team and GitHub account on 2026-10-14.
const VERCEL = [
  vp("p_self", "build-tracker", "travel-port-project"),
  vp("p_bt", "dzong-house", "bhutan"),
  vp("p_mx", "cenote-house", "mexico"),
  vp("p_cr", "selvora", "costa-rica"),
  vp("p_bj", "escale-voyages", "Escale-Voyages"),
  vp("p_gt", "antigua-and-beyond", "guatemala"),
  vp("p_tz", "uhuru-journeys", "tanzania"),
  vp("p_id", "indonesia", "indonesia"),
  vp("p_za", "cape-compass", "south-africa"),
  vp("p_ke", "safari-njema", "kenya"),
  vp("p_new", "new", "new", "persocal.com"),
  vp("p_lh", "localhost", "localhost."),
];
const GITHUB = ["travel-port-project", "bhutan", "mexico", "costa-rica", "Escale-Voyages", "kenya", "south-africa", "guatemala", "tanzania", "indonesia", "uganda", "rwanda", "new", "extrafari", "maxxing", "localhost."].map(gh);
const DOCS: Record<string, string> = {
  "benjamingjoel2/escale-voyages": "Escale Voyages, premium tour agency in Cotonou covering the whole of Benin Republic. ".repeat(4) + "Bénin Bénin. Near Nigeria and Togo.",
  "benjamingjoel2/extrafari": "Private safaris across Kenya, Tanzania, Uganda, Rwanda and Zimbabwe.",
};

let docFetches = 0;
const deps: SyncDeps = {
  listVercelProjects: async () => ({ projects: VERCEL }),
  listGithubRepos: async () => GITHUB,
  fetchRepoDocs: async (repo) => {
    docFetches++;
    return DOCS[repo] ?? "";
  },
};
const cfg = { vercelToken: "t", githubOwner: "benjamingjoel2", selfRepo: "benjamingjoel2/travel-port-project" };

let db: Db;
beforeAll(async () => {
  db = drizzle(new PGlite(), { schema }) as unknown as Db;
  await migrate(db as never, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await seedDatabase(db);
});

async function brandBy(name: string) {
  return db.query.brands.findFirst({ where: eq(schema.brands.name, name), with: { stage: true, region: true, snapshots: true } });
}

describe("runSync", () => {
  it("adds new brands, links the seeded ones and queues the rest", async () => {
    const s = await runSync(db, cfg, deps);
    expect(s.ok).toBe(true);
    expect(s.added.sort()).toEqual(["Cape Compass", "Dzong House", "Escale Voyages", "Rwanda", "Selvora", "Uganda"]);
    expect(s.linked.sort()).toEqual(["Antigua & Beyond", "Cenote House", "Nusa & Co.", "Safari Njema", "Uhuru Journeys"]);
    expect(s.advanced.sort()).toEqual(["Antigua & Beyond", "Cenote House", "Nusa & Co.", "Safari Njema", "Uhuru Journeys"]);

    const all = await db.query.brands.findMany();
    expect(all).toHaveLength(11);
    expect(all.some((b) => b.name === "Build Tracker" || b.repoUrl?.includes("travel-port-project"))).toBe(false);

    const queue = await db.query.syncItems.findMany({ where: eq(schema.syncItems.status, "pending") });
    expect(queue.map((q) => q.name).sort()).toEqual(["Extrafari", "Localhost", "Maxxing", "New"]);
  });

  it("fills in country, region, links and deploy info", async () => {
    const bj = await brandBy("Escale Voyages");
    expect(bj?.countryCode).toBe("BJ");
    expect(bj?.country).toBe("Benin");
    expect(bj?.region?.name).toBe("West Africa");
    expect(bj?.stage.key).toBe("building");
    expect(bj?.repoUrl).toBe("https://github.com/benjamingjoel2/Escale-Voyages");
    expect(bj?.stagingUrl).toBe("https://escale-voyages.vercel.app");
    expect(bj?.snapshots.map((x) => x.kind).sort()).toEqual(["github", "vercel"]);

    const nusa = await brandBy("Nusa & Co.");
    expect(nusa?.vercelProjectId).toBe("p_id");
    expect(nusa?.githubRepo).toBe("benjamingjoel2/indonesia");
    expect(nusa?.stage.key).toBe("building");

    const ug = await brandBy("Uganda");
    expect(ug?.region?.name).toBe("East Africa");
    expect(ug?.vercelProjectId).toBeNull();
    const ugChecklist = await db.query.brandChecklistItems.findMany({ where: eq(schema.brandChecklistItems.brandId, ug!.id) });
    const ugPhases = await db.query.buildPhases.findMany({ where: eq(schema.buildPhases.brandId, ug!.id) });
    expect(ugChecklist).toHaveLength(14);
    expect(ugPhases).toHaveLength(5);
  });

  it("is idempotent and doesn't refetch READMEs", async () => {
    const before = docFetches;
    const s = await runSync(db, cfg, deps);
    expect(s.added).toEqual([]);
    expect(s.linked).toEqual([]);
    expect(s.advanced).toEqual([]);
    expect(await db.query.brands.findMany()).toHaveLength(11);
    expect(docFetches).toBe(before);
  });

  it("respects ignored items and never moves brands past Building", async () => {
    const lh = await db.query.syncItems.findFirst({ where: eq(schema.syncItems.name, "Localhost") });
    await db.update(schema.syncItems).set({ status: "ignored" }).where(eq(schema.syncItems.id, lh!.id));
    const live = await db.query.pipelineStages.findFirst({ where: eq(schema.pipelineStages.key, "live") });
    const cenote = await brandBy("Cenote House");
    await db.update(schema.brands).set({ stageId: live!.id }).where(eq(schema.brands.id, cenote!.id));

    const s = await runSync(db, cfg, deps);
    expect(s.queued).toBe(3);
    expect((await db.query.syncItems.findFirst({ where: eq(schema.syncItems.id, lh!.id) }))?.status).toBe("ignored");
    expect((await brandBy("Cenote House"))?.stage.key).toBe("live");
  });

  it("does not overwrite links a person typed", async () => {
    const sel = await brandBy("Selvora");
    await db.update(schema.brands).set({ stagingUrl: "https://my-own-staging.example" }).where(eq(schema.brands.id, sel!.id));
    await runSync(db, cfg, deps);
    expect((await brandBy("Selvora"))?.stagingUrl).toBe("https://my-own-staging.example");
  });

  it("survives two syncs started at the same moment", async () => {
    const [a, b] = await Promise.all([runSync(db, cfg, deps), runSync(db, cfg, deps)]);
    expect(a.ok && b.ok).toBe(true);
    expect(await db.query.brands.findMany()).toHaveLength(11);
  });

  it("reports a failure without touching data when every source fails", async () => {
    const s = await runSync(db, cfg, {
      ...deps,
      listVercelProjects: async () => {
        throw new Error("401");
      },
      listGithubRepos: async () => {
        throw new Error("403");
      },
    });
    expect(s.ok).toBe(false);
    expect(s.error).toMatch(/401/);
    expect(await db.query.brands.findMany()).toHaveLength(11);
  });
});
