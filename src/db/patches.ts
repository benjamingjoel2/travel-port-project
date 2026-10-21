import { and, eq, inArray, max, or, sql } from "drizzle-orm";
import type { Db } from "./index";
import * as schema from "./schema";
import { initializeBrandChildren } from "./seed";
import { slugify } from "@/lib/utils";

type BrandSpec = {
  name: string;
  /** owner/repo, lower case, as auto-sync stores it. */
  repo: string;
  brandType: "country" | "region" | "niche";
  /** Country name, region name or niche label. */
  label: string;
  countryCode?: string;
  regionName: string;
  markets: string[];
};

/** Set a brand's type and markets, creating it (from its GitHub repo) if auto-sync hasn't added it yet. */
async function upsertBrand(db: Db, b: BrandSpec) {
  const region = await db.query.regions.findFirst({ where: eq(schema.regions.name, b.regionName) });
  const values = {
    brandType: b.brandType,
    country: b.label,
    countryCode: b.brandType === "country" ? (b.countryCode ?? null) : null,
    marketsCovered: b.markets,
    regionId: region?.id ?? null,
    updatedAt: new Date(),
  };
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
    await db.insert(schema.activityLog).values({ brandId: brand.id, action: "brand_created", actorName: "Setup", details: { name: b.name, source: `${b.brandType} brand (${b.label})` } });
  }
  // Its waiting projects (GitHub repo and any Vercel project built from it) now belong to this brand.
  await db.update(schema.syncItems).set({ status: "linked", brandId: brand.id }).where(or(eq(schema.syncItems.key, `github:${b.repo}`), eq(schema.syncItems.repo, b.repo)));
}

function makeRegionBrand(db: Db, b: Omit<BrandSpec, "brandType">) {
  return upsertBrand(db, { ...b, brandType: "region" });
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
  {
    // Benjamin (owner) gets a personal login too; from now on only people with one can sign in.
    id: "2026-10-17-benjamin-login",
    run: async (db) => {
      const passwordHash =
        "scrypt$dd3aea73a2dcb0c4ea378a675540d571$31863f86771a7acccfd4ee5651c4820529bed201f443eaa02fc43b3aee7f4d10ffeea975ec94c61074e8db0be262198acfe576440587d70a100cf7168f65fbda";
      const matches = await db.query.teamMembers.findMany({
        where: sql`lower(${schema.teamMembers.name}) in ('benjamin', 'ben') or lower(${schema.teamMembers.name}) like 'benjamin %'`,
        orderBy: (m, { asc }) => [asc(m.createdAt)],
      });
      let member = matches.find((m) => m.role === "owner") ?? matches[0];
      if (member) {
        await db.update(schema.teamMembers).set({ name: "Benjamin", role: "owner", active: true, updatedAt: new Date() }).where(eq(schema.teamMembers.id, member.id));
      } else {
        [member] = await db.insert(schema.teamMembers).values({ name: "Benjamin", role: "owner" }).returning();
      }
      await db
        .insert(schema.memberLogins)
        .values({ memberId: member.id, passwordHash })
        .onConflictDoUpdate({ target: schema.memberLogins.memberId, set: { passwordHash, updatedAt: new Date() } });
    },
  },
  {
    // Sevo is an owner too.
    id: "2026-10-17-sevo-owner",
    run: async (db) => {
      await db.update(schema.teamMembers).set({ role: "owner", updatedAt: new Date() }).where(eq(schema.teamMembers.name, "Sevo Widodo"));
    },
  },
  {
    // Brands the team confirmed from the auto-sync review list.
    id: "2026-10-20-bac-gustav-safari-golf",
    run: async (db) => {
      await upsertBrand(db, {
        name: "Brazil Adventure Club",
        repo: "benjamingjoel2/bac-concierge-",
        brandType: "country",
        label: "Brazil",
        countryCode: "BR",
        regionName: "Latin America",
        markets: ["Brazil"],
      });
      await upsertBrand(db, {
        name: "Gustav",
        repo: "benjamingjoel2/gustav-for-scandinavia",
        brandType: "region",
        label: "Scandinavia",
        regionName: "Europe",
        markets: ["Norway", "Sweden", "Denmark", "Finland"],
      });
      await upsertBrand(db, {
        name: "Safari Golf Tour",
        repo: "benjamingjoel2/safari-golf-tour",
        brandType: "niche",
        label: "Golf safaris",
        regionName: "East Africa",
        markets: ["Golf", "Safari"],
      });
    },
  },
  {
    // The team confirmed these waiting projects are not travel brands, or duplicate an existing one.
    id: "2026-10-20-ignore-non-travel-and-duplicates",
    run: async (db) => {
      const repos = [
        // Not travel brands
        "benjamingjoel2/projectour",
        "benjamingjoel2/persocal",
        "benjamingjoel2/localhost.",
        "benjamingjoel2/new",
        "benjamingjoel2/empty",
        "benjamingjoel2/grounder",
        "benjamingjoel2/hyperlocal",
        "benjamingjoel2/hyperporter",
        "benjamingjoel2/main-hyperporter-2",
        "benjamingjoel2/maxxing",
        "benjamingjoel2/offness",
        // Duplicates Sabbatical Portugal
        "benjamingjoel2/sabbatical",
      ];
      // Vercel projects with no repo, matched by their listed name.
      const names = ["Sc Verify", "Porto Season", "Porto Season Deps", "Ps Deps Cache", "Seventh Continent"];
      await db
        .update(schema.syncItems)
        .set({ status: "ignored" })
        .where(and(eq(schema.syncItems.status, "pending"), or(inArray(schema.syncItems.repo, repos), inArray(schema.syncItems.name, names))));
    },
  },
  {
    // The "work on next" plan from the Country Tracker doc. Wave 1 starts as Up next.
    id: "2026-10-20-planned-countries",
    run: async (db) => {
      const plan = [
        { wave: 1, countryCode: "PE", label: null, note: "Machu Picchu; pairs with Mexico, Guatemala, Costa Rica" },
        { wave: 1, countryCode: "MA", label: null, note: "Top North Africa demand; links Europe and Aravia" },
        { wave: 1, countryCode: "TH", label: null, note: "Big tailor-made market" },
        { wave: 1, countryCode: "VN", label: null, note: "Pairs with Thailand and Cambodia" },
        { wave: 1, countryCode: "LK", label: null, note: "Same style of trip as Bhutan and India" },
        { wave: 1, countryCode: "IT", label: null, note: "Strong high-spend demand" },
        { wave: 1, countryCode: "GR", label: null, note: "Summer and honeymoon demand" },
        { wave: 1, countryCode: "NZ", label: null, note: "First brand in Oceania" },
        { wave: 2, countryCode: "AR", label: null, note: "Patagonia; Southern Hemisphere seasons" },
        { wave: 2, countryCode: "CL", label: null, note: "Patagonia and Atacama; pairs with Argentina" },
        { wave: 2, countryCode: "CO", label: null, note: "Fills out Latin America" },
        { wave: 2, countryCode: "EC", label: "Ecuador (Gal\u00e1pagos)", note: "Gal\u00e1pagos is a stand-alone draw" },
        { wave: 2, countryCode: "NP", label: null, note: "Sits between Bhutan and India" },
        { wave: 2, countryCode: "KH", label: null, note: "Add-on to Vietnam and Thailand" },
        { wave: 2, countryCode: "LA", label: null, note: "Add-on to Vietnam and Thailand" },
        { wave: 2, countryCode: "NA", label: null, note: "Extrafari already sells it" },
        { wave: 2, countryCode: "BW", label: null, note: "Extrafari already sells it" },
        { wave: 2, countryCode: "ZW", label: null, note: "Victoria Falls; pairs with Zambia" },
        { wave: 2, countryCode: "MU", label: null, note: "Beach add-on to safaris" },
        { wave: 2, countryCode: "SC", label: null, note: "Honeymoon add-on to safaris" },
        { wave: 2, countryCode: "MG", label: null, note: "Wildlife; near our East Africa brands" },
        { wave: 3, countryCode: "ES", label: null, note: "Large market next to France and Portugal" },
        { wave: 3, countryCode: "HR", label: null, note: "Coast and islands" },
        { wave: 3, countryCode: "TR", label: null, note: "Bridges Europe and Aravia" },
        { wave: 3, countryCode: "IE", label: null, note: "English-speaking market" },
        { wave: 3, countryCode: "GB", label: "Scotland (UK)", note: "Highlands and whisky trips" },
        { wave: 3, countryCode: "PH", label: null, note: "Islands; near Indonesia" },
        { wave: 3, countryCode: "UZ", label: null, note: "Silk Road; near Mongolia" },
        { wave: 3, countryCode: "GE", label: null, note: "Fast-growing destination" },
        { wave: 3, countryCode: "GH", label: null, note: "Next to Benin" },
        { wave: 3, countryCode: "SN", label: null, note: "French-speaking, like Benin" },
        { wave: 3, countryCode: "BZ", label: null, note: "Next to Guatemala and Mexico" },
        { wave: 3, countryCode: "PA", label: null, note: "Next to Costa Rica" },
        { wave: 3, countryCode: "AU", label: null, note: "Pairs with New Zealand" },
      ];
      await db
        .insert(schema.plannedCountries)
        .values(plan.map((p, i) => ({ ...p, sortOrder: i + 1, status: p.wave === 1 ? ("up_next" as const) : ("not_started" as const) })))
        .onConflictDoNothing();
    },
  },
  {
    // Switzerland was started before it was planned; the team added it to the plan.
    id: "2026-10-21-plan-switzerland",
    run: async (db) => {
      const [{ value: last }] = await db.select({ value: max(schema.plannedCountries.sortOrder) }).from(schema.plannedCountries);
      await db
        .insert(schema.plannedCountries)
        .values({ countryCode: "CH", wave: 1, note: "Alps; next to France and Italy", status: "up_next", sortOrder: (last ?? 0) + 1 })
        .onConflictDoNothing();
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
