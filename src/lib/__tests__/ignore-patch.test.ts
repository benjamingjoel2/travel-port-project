import path from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import { applyDataPatches } from "@/db/patches";
import type { Db } from "@/db";
import { runSync } from "@/lib/sync/engine";
import type { VercelProject } from "@/lib/sync/sources";

const vp = (id: string, name: string, repo: string | null): VercelProject => ({
  id,
  name,
  repo,
  repoUrl: repo ? `https://github.com/${repo}` : null,
  projectUrl: `https://vercel.com/team/${name}`,
  stagingUrl: `https://${name}.vercel.app`,
  customDomain: null,
  production: null,
  latest: null,
  createdAt: 1,
});

describe("ignoring non-travel projects and duplicates", () => {
  it("ignores exactly the named waiting projects, and they stay ignored after sync", async () => {
    const db = drizzle(new PGlite(), { schema }) as unknown as Db;
    await migrate(db as never, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    await seedDatabase(db);
    const deps = {
      listVercelProjects: async () => ({
        projects: [vp("p_hp", "real-hyperporter", "benjamingjoel2/projectour"), vp("p_porto", "porto-season", null), vp("p_7c", "seventh-continent", null), vp("p_peru", "inka-trails", null)],
      }),
      listGithubRepos: async () =>
        ["empty", "offness", "sabbatical"].map((name) => ({ fullName: `benjamingjoel2/${name}`, name, htmlUrl: `https://github.com/benjamingjoel2/${name}`, pushedAt: "2026-10-16T10:00:00Z", private: false })),
      fetchRepoDocs: async () => "",
    };
    const cfg = { vercelToken: "t", githubOwner: "benjamingjoel2", selfRepo: "benjamingjoel2/travel-port-project" };
    // Sync first so the projects are waiting (as in production), then apply the patch.
    await runSync(db, cfg, deps);
    expect((await db.query.syncItems.findMany({ where: eq(schema.syncItems.status, "pending") })).length).toBe(7);
    await applyDataPatches(db);
    await runSync(db, cfg, deps);
    const pending = await db.query.syncItems.findMany({ where: eq(schema.syncItems.status, "pending") });
    expect(pending.map((p) => p.name)).toEqual(["Inka Trails"]);
    expect(await db.query.syncItems.findMany({ where: eq(schema.syncItems.status, "ignored") })).toHaveLength(6);
  });
});
