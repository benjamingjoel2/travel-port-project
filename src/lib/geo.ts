import countries from "i18n-iso-countries";
import type { BrandSummary } from "@/lib/data/brands";

export type CountryShade = {
  color: string;
  stageName: string;
  /** sortOrder of the stage that decided the colour (furthest-along brand wins). */
  rank: number;
  brands: { name: string; slug: string; stageName: string }[];
};

/**
 * ISO 3166-1 numeric code as the world-atlas TopoJSON uses it: a zero-padded
 * 3-digit string ("064" for Bhutan, "404" for Kenya).
 */
export function mapIdForCountry(alpha2: string | null | undefined): string | null {
  if (!alpha2) return null;
  const numeric = countries.alpha2ToNumeric(alpha2.toUpperCase());
  return numeric ? numeric.padStart(3, "0") : null;
}

type ShadingInput = Pick<BrandSummary, "name" | "slug" | "countryCode"> & { stage: Pick<BrandSummary["stage"], "name" | "color" | "sortOrder" | "isTerminal"> };

/** Map ids → colour and brands for that country. */
export function buildCountryShading(brands: ShadingInput[]): Record<string, CountryShade> {
  const out: Record<string, CountryShade> = {};
  for (const b of brands) {
    const key = mapIdForCountry(b.countryCode);
    if (!key) continue;
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
