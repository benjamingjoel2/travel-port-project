import { geoArea, geoCentroid } from "d3-geo";
import type { Feature, MultiPolygon, Polygon } from "geojson";

export type CountryShape = Feature<Polygon | MultiPolygon, { name?: string }>;

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
