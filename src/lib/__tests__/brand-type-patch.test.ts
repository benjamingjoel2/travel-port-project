import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { seedDatabase, initializeBrandChildren } from "@/db/seed";
import { applyDataPatches } from "@/db/patches";
import type { Db } from "@/db";
import { runSync } from "@/lib/sync/engine";

let db: Db;
beforeAll(async () => {
  db = drizzle(new PGlite(), { schema }) as unknown as Db;
  await migrate(db as never, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await seedDatabase(db);
});

describe("brand type", () => {
  it("existing brands are country brands whose market is their own country", async () => {
    const nusa = await db.query.brands.findFirst({ where: eq(schema.brands.name, "Nusa & Co.") });
    expect(nusa?.brandType).toBe("country");
    expect(nusa?.marketsCovered).toEqual(["Indonesia"]);
  });

  it("turns an auto-added Aravia into a region brand, once, and sync leaves it alone", async () => {
    const stage = await db.query.pipelineStages.findFirst({ where: eq(schema.pipelineStages.key, "building") });
    const [aravia] = await db
      .insert(schema.brands)
      .values({ name: "Aravia", slug: "aravia", country: "United Arab Emirates", countryCode: "AE", marketsCovered: ["United Arab Emirates"], stageId: stage!.id, source: "github", githubRepo: "benjamingjoel2/aravia" })
      .returning();
    await initializeBrandChildren(db, aravia.id);

    await applyDataPatches(db);
    let b = await db.query.brands.findFirst({ where: eq(schema.brands.id, aravia.id), with: { region: true } });
    expect(b?.brandType).toBe("region");
    expect(b?.country).toBe("Arab world");
    expect(b?.countryCode).toBeNull();
    expect(b?.marketsCovered).toEqual(["United Arab Emirates", "Saudi Arabia", "Oman", "Qatar", "Jordan", "Bahrain", "Egypt"]);
    expect(b?.region?.name).toBe("North Africa & Middle East");

    // A later manual edit is not undone by the patch running again.
    await db.update(schema.brands).set({ marketsCovered: ["Oman"] }).where(eq(schema.brands.id, aravia.id));
    await applyDataPatches(db);

    await runSync(db, { vercelToken: "t", githubOwner: "benjamingjoel2", selfRepo: "benjamingjoel2/travel-port-project" }, {
      listVercelProjects: async () => ({ projects: [] }),
      listGithubRepos: async () => [{ fullName: "benjamingjoel2/aravia", name: "aravia", htmlUrl: "https://github.com/benjamingjoel2/aravia", pushedAt: "2026-10-16T10:00:00Z", private: false }],
      fetchRepoDocs: async () => "Luxury travel across the UAE, Saudi Arabia and Oman.",
    });
    b = await db.query.brands.findFirst({ where: eq(schema.brands.id, aravia.id), with: { region: true } });
    expect(b?.brandType).toBe("region");
    expect(b?.countryCode).toBeNull();
    expect(b?.marketsCovered).toEqual(["Oman"]);
    expect(await db.query.brands.findMany({ where: eq(schema.brands.name, "Aravia") })).toHaveLength(1);
  });
});
