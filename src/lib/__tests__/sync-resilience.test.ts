import path from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import type { Db } from "@/db";
import { runSync } from "@/lib/sync/engine";
import type { GithubRepo } from "@/lib/sync/sources";

const gh = (name: string): GithubRepo => ({ fullName: `benjamingjoel2/${name}`, name, htmlUrl: `https://github.com/benjamingjoel2/${name}`, pushedAt: "2026-10-20T10:00:00Z", private: false });

describe("sync resilience", () => {
  it("skips a project that fails and still adds every other one", async () => {
    const db = drizzle(new PGlite(), { schema }) as unknown as Db;
    await migrate(db as never, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    await seedDatabase(db);
    const cfg = { vercelToken: "t", githubOwner: "benjamingjoel2", selfRepo: "benjamingjoel2/travel-port-project" };
    const s = await runSync(db, cfg, {
      listVercelProjects: async () => ({ projects: [] }),
      listGithubRepos: async () => [gh("mystery-brand"), gh("switzerland"), gh("croatia")],
      fetchRepoDocs: async (repo) => {
        if (repo.endsWith("mystery-brand")) throw new Error("README exploded");
        return "";
      },
    });
    expect(s.ok).toBe(true);
    expect(s.added.sort()).toEqual(["Croatia", "Switzerland"]);
    expect(s.warnings).toEqual(["Mystery Brand: README exploded"]);
    for (const code of ["CH", "HR"]) expect(await db.query.brands.findMany({ where: eq(schema.brands.countryCode, code) })).toHaveLength(1);
    // The failed project left nothing half-written, and the next run tries it again.
    expect(await db.query.syncItems.findFirst({ where: eq(schema.syncItems.key, "github:benjamingjoel2/mystery-brand") })).toBeUndefined();
  });
});
