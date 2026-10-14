import { describe, expect, it } from "vitest";
import { detectCountryFromName, detectCountryFromText, humanize } from "@/lib/sync/detect";
import { regionForCountry } from "@/lib/sync/regions";

describe("detectCountryFromName", () => {
  it("matches repo-style country names", () => {
    expect(detectCountryFromName("costa-rica")).toBe("CR");
    expect(detectCountryFromName("south-africa")).toBe("ZA");
    expect(detectCountryFromName("bhutan")).toBe("BT");
    expect(detectCountryFromName("Indonesia")).toBe("ID");
    expect(detectCountryFromName("ivory_coast")).toBe("CI");
  });
  it("does not guess from partial or brand names", () => {
    expect(detectCountryFromName("new")).toBeNull();
    expect(detectCountryFromName("cenote-house")).toBeNull();
    expect(detectCountryFromName("Escale-Voyages")).toBeNull();
    expect(detectCountryFromName("localhost.")).toBeNull();
  });
});

describe("detectCountryFromText", () => {
  it("picks a clearly dominant country", () => {
    const readme = "Escale Voyages, a tour agency in Cotonou covering Benin. ".repeat(3) + "Bénin Bénin Benin. Close to Nigeria and Togo.";
    expect(detectCountryFromText(readme)).toBe("BJ");
  });
  it("stays undecided for multi-country brands", () => {
    expect(detectCountryFromText("Safaris across Kenya, Tanzania, Uganda and Rwanda. Kenya Tanzania Uganda Rwanda Kenya Tanzania")).toBeNull();
  });
  it("needs enough evidence", () => {
    expect(detectCountryFromText("A trip to Peru.")).toBeNull();
  });
  it("does not double count nested names", () => {
    expect(detectCountryFromText("Papua New Guinea ".repeat(6))).toBe("PG");
  });
});

describe("helpers", () => {
  it("humanizes slugs", () => {
    expect(humanize("dzong-house")).toBe("Dzong House");
    expect(humanize("Escale-Voyages")).toBe("Escale Voyages");
  });
  it("maps countries to regions", () => {
    expect(regionForCountry("BJ")).toBe("West Africa");
    expect(regionForCountry("bt")).toBe("Asia");
    expect(regionForCountry("CR")).toBe("Latin America");
    expect(regionForCountry("ZA")).toBe("Southern Africa");
    expect(regionForCountry(null)).toBeNull();
  });
});
