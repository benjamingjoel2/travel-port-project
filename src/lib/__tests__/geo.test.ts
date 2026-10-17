import { describe, expect, it } from "vitest";
import world from "@/data/world-110m.json";
import { buildCountryShading, mapIdForCountry } from "@/lib/geo";

const mapIds = new Set((world as { objects: { countries: { geometries: { id: string | number }[] } } }).objects.countries.geometries.map((g) => String(g.id)));
const stage = (name: string, sortOrder: number, isTerminal = false) => ({ name, color: `#${sortOrder}`, sortOrder, isTerminal });

describe("map ids", () => {
  it("matches the world map for every current brand country, including zero-padded codes", () => {
    for (const code of ["ID", "MX", "GT", "KE", "TZ", "BT", "CR", "BJ", "ZA", "UG", "RW"]) {
      expect(mapIds.has(mapIdForCountry(code)!), code).toBe(true);
    }
    expect(mapIdForCountry("BT")).toBe("064");
  });

  it("lets the furthest-along brand set the colour, ignoring paused ones", () => {
    const s = buildCountryShading([
      { name: "A", slug: "a", countryCode: "KE", stage: stage("Building", 40) },
      { name: "B", slug: "b", countryCode: "KE", stage: stage("Paused", 90, true) },
      { name: "C", slug: "c", countryCode: "BT", stage: stage("Idea", 10) },
    ]);
    expect(s["404"].stageName).toBe("Building");
    expect(s["404"].brands).toHaveLength(2);
    expect(s["064"].brands[0].name).toBe("C");
  });

  it("shades every market of a region brand and nothing for a niche brand", () => {
    const s = buildCountryShading([
      { name: "Aravia", slug: "aravia", countryCode: null, brandType: "region", marketsCovered: ["United Arab Emirates", "Saudi Arabia", "Oman", "Qatar", "Jordan", "Bahrain", "Egypt"], stage: stage("Building", 40) },
      { name: "Dive", slug: "dive", countryCode: "ID", brandType: "niche", marketsCovered: ["Scuba diving"], stage: stage("Idea", 10) },
    ]);
    for (const code of ["AE", "SA", "OM", "QA", "JO", "BH", "EG"]) expect(s[mapIdForCountry(code)!]?.brands[0].name, code).toBe("Aravia");
    expect(s[mapIdForCountry("ID")!]).toBeUndefined();
  });
});

