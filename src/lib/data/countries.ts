import "server-only";
import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { plannedCountries, type PipelineStage, type PlannedCountry } from "@/db/schema";
import { GOAL_BRAND_COUNT } from "@/lib/constants";
import { countryByCode } from "@/lib/countries";
import { countryCodesFor } from "@/lib/geo";
import { regionForCountry } from "@/lib/sync/regions";
import { listBrands } from "./brands";

type StageInfo = Pick<PipelineStage, "name" | "color" | "sortOrder" | "countsAsLive" | "isTerminal">;
export type CoveringBrand = { name: string; slug: string; via: "country" | "region"; stage: StageInfo };
export type CoveredCountry = { code: string; name: string; region: string | null; brands: CoveringBrand[]; live: boolean; stage: StageInfo };
export type PlannedRow = PlannedCountry & {
  name: string;
  region: string | null;
  /** A single-country brand for this country exists, so the plan item is started. */
  countryBrand: CoveringBrand | null;
  /** Region brands that already sell it. */
  alsoIn: CoveringBrand[];
};

/** Everything the Countries page shows. A country is covered by its own brand or by a region brand's markets. */
export async function getCountryOverview() {
  const [brands, plan] = await Promise.all([listBrands(), (await getDb()).query.plannedCountries.findMany({ orderBy: [asc(plannedCountries.wave), asc(plannedCountries.sortOrder)] })]);
  const active = brands.filter((b) => b.stage.key !== "dropped");

  const covered = new Map<string, CoveredCountry>();
  for (const b of active) {
    for (const code of countryCodesFor(b)) {
      const entry =
        covered.get(code) ??
        ({ code, name: countryByCode(code)?.name ?? code, region: regionForCountry(code), brands: [], live: false, stage: b.stage } satisfies CoveredCountry);
      entry.brands.push({ name: b.name, slug: b.slug, via: b.brandType === "region" ? "region" : "country", stage: b.stage });
      if (b.stage.countsAsLive) entry.live = true;
      // The furthest-along brand that isn't paused sets the country's stage.
      if (!b.stage.isTerminal && (entry.stage.isTerminal || b.stage.sortOrder > entry.stage.sortOrder)) entry.stage = b.stage;
      covered.set(code, entry);
    }
  }
  const coveredList = [...covered.values()].sort((a, b) => (a.region ?? "~").localeCompare(b.region ?? "~") || a.name.localeCompare(b.name));

  const planned: PlannedRow[] = plan.map((p) => {
    const brandsHere = covered.get(p.countryCode)?.brands ?? [];
    return {
      ...p,
      name: p.label || countryByCode(p.countryCode)?.name || p.countryCode,
      region: regionForCountry(p.countryCode),
      countryBrand: brandsHere.find((b) => b.via === "country") ?? null,
      alsoIn: brandsHere.filter((b) => b.via === "region"),
    };
  });

  const brandCount = active.length;
  return {
    goal: GOAL_BRAND_COUNT,
    brandCount,
    brandsLeft: Math.max(0, GOAL_BRAND_COUNT - brandCount),
    liveBrands: active.filter((b) => b.stage.countsAsLive).length,
    covered: coveredList,
    liveCountries: coveredList.filter((c) => c.live).length,
    planned,
    brands: active,
  };
}

export type CountryOverview = Awaited<ReturnType<typeof getCountryOverview>>;
