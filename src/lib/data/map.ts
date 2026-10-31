import "server-only";
import { PLANNED_STATUS_LABELS } from "@/lib/constants";
import { countryCodesFor, mapIdForCountry } from "@/lib/geo";
import { SITE_LEVEL_RANK, siteLevel, type SiteLevel } from "@/lib/site-level";
import { getMonitorRows, isDown } from "@/lib/monitor";
import { getCountryOverview } from "./countries";

/** A country's step on the way to a live site: not started (or only planned), code on GitHub, preview site, live. */
export type MapStatus = "none" | "repo" | "preview" | "live";
const statusOf = (level: SiteLevel): MapStatus => (level === "idea" ? "none" : level);
export type MapBrand = {
  name: string;
  slug: string;
  stageName: string;
  stageColor: string;
  via: "country" | "region" | "niche";
  level: SiteLevel;
  /** The live site, preview link or repo that shows the level. */
  url: string | null;
};
export type MapCountry = {
  id: string;
  code: string;
  name: string;
  status: MapStatus;
  /** Colour of the furthest-along brand's stage (or empty for planned-only countries). */
  stageColor: string;
  stageName: string;
  brands: MapBrand[];
  /** "Wave 1 · Up next" when the country is on the plan. */
  plan: string | null;
};
export type MapSearchBrand = MapBrand & { countryIds: string[] };

/** Everything the home map shows, keyed by the world-atlas id of each country. */
export async function getMapData() {
  const o = await getCountryOverview();
  const countries: Record<string, MapCountry> = {};
  const levels = new Map(o.brands.map((b) => [b.slug, siteLevel(b)]));
  const levelOf = (slug: string) => levels.get(slug) ?? { level: "idea" as const, url: null };

  for (const c of o.covered) {
    const id = mapIdForCountry(c.code);
    if (!id) continue;
    const brands: MapBrand[] = c.brands.map((b) => ({ name: b.name, slug: b.slug, stageName: b.stage.name, stageColor: b.stage.color, via: b.via, ...levelOf(b.slug) }));
    // The furthest-along brand decides the colour: one live site makes the country live.
    const best = brands.reduce<SiteLevel>((acc, b) => (SITE_LEVEL_RANK[b.level] > SITE_LEVEL_RANK[acc] ? b.level : acc), "idea");
    countries[id] = { id, code: c.code, name: c.name, status: statusOf(best), stageColor: c.stage.color, stageName: c.stage.name, brands, plan: null };
  }
  for (const p of o.planned) {
    if (p.status === "skipped") continue;
    const id = mapIdForCountry(p.countryCode);
    if (!id) continue;
    const plan = `Wave ${p.wave} · ${PLANNED_STATUS_LABELS[p.status]}`;
    countries[id] ??= { id, code: p.countryCode, name: p.name, status: "none", stageColor: "", stageName: "", brands: [], plan };
    countries[id].plan = plan;
  }

  const brands: MapSearchBrand[] = o.brands.map((b) => ({
    name: b.name,
    slug: b.slug,
    stageName: b.stage.name,
    stageColor: b.stage.color,
    via: b.brandType === "niche" ? "niche" : b.brandType === "region" ? "region" : "country",
    ...levelOf(b.slug),
    countryIds: countryCodesFor(b)
      .map((code) => mapIdForCountry(code))
      .filter((id): id is string => Boolean(id)),
  }));

  const list = Object.values(countries);
  // Only current sites count: a dropped brand or an old address keeps its last check but is not down now.
  const monitored = await getMonitorRows();
  return {
    countries,
    brands,
    stats: {
      brands: o.brandCount,
      goal: o.goal,
      countries: o.covered.length,
      // Countries at each step.
      none: list.filter((c) => c.status === "none").length,
      repo: list.filter((c) => c.status === "repo").length,
      preview: list.filter((c) => c.status === "preview").length,
      live: list.filter((c) => c.status === "live").length,
      /** Sites down right now (two failed checks in a row), for the warning on the map. */
      sitesDown: monitored.filter((r) => r.uptime?.url === r.url && isDown(r.uptime)).length,
    },
  };
}

export type MapData = Awaited<ReturnType<typeof getMapData>>;
