import "server-only";
import countries from "i18n-iso-countries";
import type { BrandSummary } from "@/lib/data/brands";

export type CountryShade = {
  color: string;
  stageName: string;
  /** sortOrder of the stage that decided the colour (furthest-along brand wins). */
  rank: number;
  brands: { name: string; slug: string; stageName: string }[];
};

/** Map numeric ISO ids (as used by the world-atlas TopoJSON) to the colour and brands for that country. */
export function buildCountryShading(brands: BrandSummary[]): Record<string, CountryShade> {
  const out: Record<string, CountryShade> = {};
  for (const b of brands) {
    if (!b.countryCode) continue;
    const numeric = countries.alpha2ToNumeric(b.countryCode.toUpperCase());
    if (!numeric) continue;
    const key = String(Number(numeric)); // "404" not "0404"
    const entry = (out[key] ??= { color: b.stage.color, stageName: b.stage.name, rank: -1, brands: [] });
    entry.brands.push({ name: b.name, slug: b.slug, stageName: b.stage.name });
    // The furthest-along (non-paused/dropped) brand decides the colour.
    const rank = b.stage.isTerminal ? -1 : b.stage.sortOrder;
    if (rank > entry.rank) {
      entry.rank = rank;
      entry.color = b.stage.color;
      entry.stageName = b.stage.name;
    }
  }
  return out;
}
