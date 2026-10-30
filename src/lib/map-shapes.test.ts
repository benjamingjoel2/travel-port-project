import { describe, expect, it } from "vitest";
import coarse from "@/data/world-110m.json";
import detailed from "../../public/maps/countries-50m.json";
import { toShapes, type CountriesTopo } from "./map-shapes";

describe("toShapes", () => {
  for (const [name, topo] of [["110m", coarse], ["50m", detailed]] as const) {
    it(`gives every ${name} country a unique id`, () => {
      const ids = toShapes(topo as unknown as CountriesTopo).map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  }
  it("joins Ashmore and Cartier Is. into Australia, keeping Australia's name", () => {
    const au = toShapes(detailed as unknown as CountriesTopo).find((s) => s.id === "036");
    expect(au?.name).toBe("Australia");
    expect(au?.geo.geometry.type).toBe("MultiPolygon");
  });
});
