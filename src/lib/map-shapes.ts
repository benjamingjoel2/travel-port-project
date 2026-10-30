import { geoArea, geoCentroid } from "d3-geo";
import { feature } from "topojson-client";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";

export type CountryShape = Feature<Polygon | MultiPolygon, { name?: string }>;
export type CountriesTopo = Topology<{ countries: GeometryCollection<{ name?: string }> }>;
export type Shape = { id: string; name: string; geo: CountryShape; label: [number, number]; area: number };

/** A country's largest piece (France's mainland, not French Guiana). */
export function mainPart(geo: CountryShape): Feature<Polygon> | CountryShape {
  if (geo.geometry.type !== "MultiPolygon") return geo;
  let best: Feature<Polygon> | null = null;
  let bestArea = -1;
  for (const coordinates of geo.geometry.coordinates) {
    const part: Feature<Polygon> = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates } };
    const area = geoArea(part);
    if (area > bestArea) [best, bestArea] = [part, area];
  }
  return best ?? geo;
}

/** Where to put a country's name: the middle of its largest piece. */
export function labelPoint(geo: CountryShape): [number, number] {
  return geoCentroid(mainPart(geo));
}

const polygonsOf = (g: Polygon | MultiPolygon) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);

export function toShapes(topo: CountriesTopo): Shape[] {
  // Some ids repeat (the detailed file lists Ashmore and Cartier Is. under Australia's 036). Each id
  // must be drawn once, or React's duplicate keys leave stale copies of the country on screen, so
  // pieces that share an id are joined into one shape named after its largest piece.
  const byId = new Map<string, CountryShape[]>();
  (feature(topo, topo.objects.countries) as FeatureCollection<Polygon | MultiPolygon, { name?: string }>).features.forEach((f, i) => {
    const id = f.id === undefined ? `x${i}` : String(f.id);
    byId.set(id, [...(byId.get(id) ?? []), f]);
  });
  return [...byId].map(([id, parts]) => {
    const main = parts.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
    const geo: CountryShape =
      parts.length === 1 ? main : { ...main, geometry: { type: "MultiPolygon", coordinates: parts.flatMap((p) => polygonsOf(p.geometry)) } };
    return { id, name: main.properties?.name ?? "", geo, label: labelPoint(geo), area: geoArea(mainPart(geo)) };
  });
}
