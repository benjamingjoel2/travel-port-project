import type { CountryShade } from "@/lib/geo";
import type { MapCountry, MapStatus } from "@/lib/data/map";
import type { SiteLevel } from "@/lib/site-level";

/** The four steps to a live site, as one blue scale from dark (nothing yet) to bright (live). Shared by every map. */
export const PROGRESS: Record<MapStatus, { label: string; long: string; color: string }> = {
  none: { label: "Not started", long: "Nothing built yet", color: "#2b4562" },
  repo: { label: "Code started", long: "On GitHub, no site yet", color: "#3c6fa8" },
  preview: { label: "Test site", long: "On a Vercel test link", color: "#5f9fe6" },
  live: { label: "Live", long: "On its real domain", color: "#a6e1ff" },
};
export const STEPS: MapStatus[] = ["none", "repo", "preview", "live"];
export const brandStatus = (level: SiteLevel): MapStatus => (level === "idea" ? "none" : level);
/** "safari-njema.vercel.app" from "https://safari-njema.vercel.app/". */
export const hostOf = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

/** Shading for the smaller maps (Overview, Countries), coloured by progress like the home map. */
export function progressShading(countries: Record<string, MapCountry>): Record<string, CountryShade> {
  const out: Record<string, CountryShade> = {};
  for (const [id, c] of Object.entries(countries)) {
    out[id] = {
      color: PROGRESS[c.status].color,
      stageName: PROGRESS[c.status].label,
      rank: STEPS.indexOf(c.status),
      brands: c.brands.map((b) => ({ name: b.name, slug: b.slug, stageName: PROGRESS[brandStatus(b.level)].label })),
    };
  }
  return out;
}
/** Legend entries for the smaller maps. */
export const PROGRESS_LEGEND = STEPS.map((k) => ({ id: k, name: PROGRESS[k].label, color: PROGRESS[k].color }));
