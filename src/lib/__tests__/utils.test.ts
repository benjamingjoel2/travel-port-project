import { describe, expect, it } from "vitest";
import { slugify, daysUntil } from "@/lib/utils";
import { countryByName, countryByCode } from "@/lib/countries";

describe("slugify", () => {
  it("turns brand names into clean slugs", () => {
    expect(slugify("Nusa & Co.")).toBe("nusa-and-co");
    expect(slugify("Antigua & Beyond")).toBe("antigua-and-beyond");
    expect(slugify("  Safari   Njema ")).toBe("safari-njema");
    expect(slugify("Côte d'Ivoire Trails")).toBe("cote-d-ivoire-trails");
  });
});

describe("daysUntil", () => {
  it("is negative for past dates and null for empty", () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil("2000-01-01")!).toBeLessThan(0);
  });
});

describe("countries", () => {
  it("looks up loosely by name and strictly by code", () => {
    expect(countryByName("kenya")?.code).toBe("KE");
    expect(countryByName(" Mexico ")?.code).toBe("MX");
    expect(countryByCode("id")?.name).toBe("Indonesia");
    expect(countryByCode("ZZ")).toBeUndefined();
  });
});
