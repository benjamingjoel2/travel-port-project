import "server-only";
import { PLANNED_STATUS_LABELS } from "@/lib/constants";
import { countryCodesFor, mapIdForCountry } from "@/lib/geo";
import { getCountryOverview } from "./countries";

export type MapStatus = "live" | "progress" | "planned";
export type MapBrand = { name: string; slug: string; stageName: string; stageColor: string; via: "country" | "region" | "niche" };
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

  for (const c of o.covered) {
    const id = mapIdForCountry(c.code);
    if (!id) continue;
    const active = c.brands.some((b) => !b.stage.isTerminal);
    countries[id] = {
      id,
      code: c.code,
      name: c.name,
      status: c.live ? "live" : active ? "progress" : "planned",
      stageColor: c.stage.color,
      stageName: c.stage.name,
      brands: c.brands.map((b) => ({ name: b.name, slug: b.slug, stageName: b.stage.name, stageColor: b.stage.color, via: b.via })),
      plan: null,
    };
  }
  for (const p of o.planned) {
    if (p.status === "skipped") continue;
    const id = mapIdForCountry(p.countryCode);
    if (!id) continue;
    const plan = `Wave ${p.wave} · ${PLANNED_STATUS_LABELS[p.status]}`;
    countries[id] ??= { id, code: p.countryCode, name: p.name, status: "planned", stageColor: "", stageName: "", brands: [], plan };
    countries[id].plan = plan;
  }

  const brands: MapSearchBrand[] = o.brands.map((b) => ({
    name: b.name,
    slug: b.slug,
    stageName: b.stage.name,
    stageColor: b.stage.color,
    via: b.brandType === "niche" ? "niche" : b.brandType === "region" ? "region" : "country",
    countryIds: countryCodesFor(b)
      .map((code) => mapIdForCountry(code))
      .filter((id): id is string => Boolean(id)),
  }));

  const list = Object.values(countries);
  return {
    countries,
    brands,
    stats: {
      brands: o.brandCount,
      goal: o.goal,
      countries: o.covered.length,
      live: list.filter((c) => c.status === "live").length,
      planned: list.filter((c) => c.status === "planned").length,
    },
  };
}

export type MapData = Awaited<ReturnType<typeof getMapData>>;
