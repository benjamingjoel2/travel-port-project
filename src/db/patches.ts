import { eq, or, sql } from "drizzle-orm";
import type { Db } from "./index";
import * as schema from "./schema";
import { initializeBrandChildren } from "./seed";
import { slugify } from "@/lib/utils";

/** Make a brand a region brand, creating it (from its GitHub repo) if auto-sync hasn't added it yet. */
async function makeRegionBrand(db: Db, b: { name: string; repo: string; label: string; regionName: string; markets: string[] }) {
  const region = await db.query.regions.findFirst({ where: eq(schema.regions.name, b.regionName) });
  const values = { brandType: "region" as const, country: b.label, countryCode: null, marketsCovered: b.markets, regionId: region?.id ?? null, updatedAt: new Date() };
  let brand = await db.query.brands.findFirst({ where: or(eq(schema.brands.githubRepo, b.repo), sql`lower(${schema.brands.name}) = ${b.name.toLowerCase()}`) });
  if (brand) {
    await db.update(schema.brands).set(values).where(eq(schema.brands.id, brand.id));
  } else {
    const stage = await db.query.pipelineStages.findFirst({ where: eq(schema.pipelineStages.key, "building") });
    if (!stage) return;
    const base = slugify(b.name);
    let slug = base;
    for (let i = 2; await db.query.brands.findFirst({ where: eq(schema.brands.slug, slug), columns: { id: true } }); i++) slug = `${base}-${i}`;
    [brand] = await db
      .insert(schema.brands)
      .values({ ...values, name: b.name, slug, stageId: stage.id, source: "github", githubRepo: b.repo, repoUrl: `https://github.com/${b.repo}`, designReference: "other" })
      .returning();
    await initializeBrandChildren(db, brand.id);
    await db.insert(schema.activityLog).values({ brandId: brand.id, action: "brand_created", actorName: "Setup", details: { name: b.name, source: `Region brand (${b.label})` } });
  }
  await db.update(schema.syncItems).set({ status: "linked", brandId: brand.id }).where(eq(schema.syncItems.key, `github:${b.repo}`));
}

/**
 * One-time data fixes requested by the team, applied once after migrations and
 * recorded in app_state so they never run twice (and never undo later edits).
 */
const PATCHES: { id: string; run: (db: Db) => Promise<void> }[] = [
  {
    // Aravia is a region brand for the Arab world (markets from its build plan).
    id: "2026-10-17-aravia-region",
    run: (db) =>
      makeRegionBrand(db, {
        name: "Aravia",
        repo: "benjamingjoel2/aravia",
        label: "Arab world",
        regionName: "North Africa & Middle East",
        markets: ["United Arab Emirates", "Saudi Arabia", "Oman", "Qatar", "Jordan", "Bahrain", "Egypt"],
      }),
  },
  {
    // Extrafari is a region brand for East Africa (the East African countries its site sells).
    id: "2026-10-17-extrafari-region",
    run: (db) =>
      makeRegionBrand(db, {
        name: "Extrafari",
        repo: "benjamingjoel2/extrafari",
        label: "East Africa",
        regionName: "East Africa",
        markets: ["Kenya", "Tanzania", "Uganda", "Rwanda"],
      }),
  },
  {
    // Extrafari also sells Southern Africa: add those markets (keeping any edits) and widen its label.
    id: "2026-10-17-extrafari-southern-africa",
    run: async (db) => {
      const brand = await db.query.brands.findFirst({ where: eq(schema.brands.githubRepo, "benjamingjoel2/extrafari") });
      if (!brand) return;
      const markets = [...brand.marketsCovered];
      for (const m of ["South Africa", "Namibia", "Botswana", "Zambia"]) if (!markets.some((x) => x.toLowerCase() === m.toLowerCase())) markets.push(m);
      const country = brand.country === "East Africa" ? "East & Southern Africa" : brand.country;
      await db.update(schema.brands).set({ marketsCovered: markets, country, updatedAt: new Date() }).where(eq(schema.brands.id, brand.id));
    },
  },
  {
    // Sevo gets a personal login (name "Sevo Widodo"). Only the hash is stored here.
    id: "2026-10-17-sevo-login",
    run: async (db) => {
      const passwordHash =
        "scrypt$8181839fe13cc3a954842b198a26ec63$08c0947005bbdc395ff6e227943a2e94a3348051a5b0bce639b9f427ded240c7d3680f797544da16b5c74ac66044ef6d830024877aaf4fd93ba5dd5c99b9cf71";
      let member = await db.query.teamMembers.findFirst({ where: sql`lower(${schema.teamMembers.name}) in ('sevo widodo', 'sevo')` });
      if (member) {
        await db.update(schema.teamMembers).set({ name: "Sevo Widodo", active: true, updatedAt: new Date() }).where(eq(schema.teamMembers.id, member.id));
      } else {
        [member] = await db.insert(schema.teamMembers).values({ name: "Sevo Widodo", role: "editor" }).returning();
      }
      await db
        .insert(schema.memberLogins)
        .values({ memberId: member.id, passwordHash })
        .onConflictDoUpdate({ target: schema.memberLogins.memberId, set: { passwordHash, updatedAt: new Date() } });
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
