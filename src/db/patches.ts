import { eq, or, sql } from "drizzle-orm";
import type { Db } from "./index";
import * as schema from "./schema";
import { initializeBrandChildren } from "./seed";

/**
 * One-time data fixes requested by the team, applied once after migrations and
 * recorded in app_state so they never run twice (and never undo later edits).
 */
const PATCHES: { id: string; run: (db: Db) => Promise<void> }[] = [
  {
    // Aravia is a region brand for the Arab world (markets from its build plan).
    id: "2026-10-17-aravia-region",
    run: async (db) => {
      const markets = ["United Arab Emirates", "Saudi Arabia", "Oman", "Qatar", "Jordan", "Bahrain", "Egypt"];
      const repo = "benjamingjoel2/aravia";
      const region = await db.query.regions.findFirst({ where: eq(schema.regions.name, "North Africa & Middle East") });
      const values = { brandType: "region" as const, country: "Arab world", countryCode: null, marketsCovered: markets, regionId: region?.id ?? null, updatedAt: new Date() };
      let brand = await db.query.brands.findFirst({ where: or(eq(schema.brands.githubRepo, repo), sql`lower(${schema.brands.name}) = 'aravia'`) });
      if (brand) {
        await db.update(schema.brands).set(values).where(eq(schema.brands.id, brand.id));
      } else {
        const stage = await db.query.pipelineStages.findFirst({ where: eq(schema.pipelineStages.key, "building") });
        if (!stage) return;
        let slug = "aravia";
        for (let i = 2; await db.query.brands.findFirst({ where: eq(schema.brands.slug, slug), columns: { id: true } }); i++) slug = `aravia-${i}`;
        [brand] = await db
          .insert(schema.brands)
          .values({ ...values, name: "Aravia", slug, stageId: stage.id, source: "github", githubRepo: repo, repoUrl: `https://github.com/${repo}`, designReference: "other" })
          .returning();
        await initializeBrandChildren(db, brand.id);
        await db.insert(schema.activityLog).values({ brandId: brand.id, action: "brand_created", actorName: "Setup", details: { name: "Aravia", source: "Region brand (Arab world)" } });
      }
      await db.update(schema.syncItems).set({ status: "linked", brandId: brand.id }).where(eq(schema.syncItems.key, `github:${repo}`));
    },
  },
];

export async function applyDataPatches(db: Db) {
  for (const patch of PATCHES) {
    const key = `patch:${patch.id}`;
    const done = await db.query.appState.findFirst({ where: eq(schema.appState.key, key) });
    if (done) continue;
    await patch.run(db);
    await db.insert(schema.appState).values({ key, value: { appliedAt: new Date().toISOString() } }).onConflictDoNothing();
  }
}
