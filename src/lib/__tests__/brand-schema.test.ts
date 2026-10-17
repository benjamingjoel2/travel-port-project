import { describe, expect, it } from "vitest";
import { brandFormSchema, fieldErrors } from "@/lib/schemas/brand";

const STAGE = "11111111-1111-4111-8111-111111111111";

describe("brandFormSchema", () => {
  it("accepts a minimal brand and normalises empties to null", () => {
    const r = brandFormSchema.safeParse({ name: " Nusa & Co. ", country: "Indonesia", countryCode: "id", stageId: STAGE, regionId: "", ownerId: "", targetLaunchDate: "", repoUrl: "" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.name).toBe("Nusa & Co.");
    expect(r.data.countryCode).toBe("ID");
    expect(r.data.regionId).toBeNull();
    expect(r.data.repoUrl).toBeNull();
    expect(r.data.priority).toBe("medium");
    expect(r.data.contentReferenceUrls).toEqual([]);
  });

  it("treats the dropdown placeholder as no selection", () => {
    const r = brandFormSchema.parse({ name: "X", country: "Kenya", countryCode: "KE", stageId: STAGE, regionId: "__none", ownerId: "__none" });
    expect(r.regionId).toBeNull();
    expect(r.ownerId).toBeNull();
  });

  it("splits content reference URLs by line", () => {
    const r = brandFormSchema.parse({ name: "X", country: "Kenya", countryCode: "KE", stageId: STAGE, contentReferenceUrls: "https://a.com\n\n  https://b.com (blog) \n" });
    expect(r.contentReferenceUrls).toEqual(["https://a.com", "https://b.com (blog)"]);
  });

  it("rejects missing name and bad urls with field-level messages", () => {
    const r = brandFormSchema.safeParse({ name: "", country: "Kenya", countryCode: "KE", stageId: STAGE, repoUrl: "not a url" });
    expect(r.success).toBe(false);
    if (r.success) return;
    const errs = fieldErrors(r.error);
    expect(errs.name).toMatch(/required/i);
    expect(errs.repoUrl).toMatch(/web address/i);
  });

  it("rejects logos that are not images", () => {
    const r = brandFormSchema.safeParse({ name: "X", country: "Kenya", countryCode: "KE", stageId: STAGE, logoData: "data:text/plain;base64,AAAA" });
    expect(r.success).toBe(false);
  });

  it("defaults a country brand's markets to its own country", () => {
    const r = brandFormSchema.parse({ name: "X", country: "Kenya", countryCode: "KE", stageId: STAGE });
    expect(r.brandType).toBe("country");
    expect(r.marketsCovered).toEqual(["Kenya"]);
  });

  it("requires a picked country for country brands", () => {
    const r = brandFormSchema.safeParse({ name: "X", country: "Kenya", countryCode: "", stageId: STAGE });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(fieldErrors(r.error).countryCode).toMatch(/pick a country/i);
  });

  it("accepts a region brand with a list of markets and no country code", () => {
    const r = brandFormSchema.parse({
      name: "Aravia",
      brandType: "region",
      country: "Arab world",
      countryCode: "",
      stageId: STAGE,
      marketsCovered: "United Arab Emirates, Saudi Arabia\nOman; oman\n\nJordan",
    });
    expect(r.brandType).toBe("region");
    expect(r.countryCode).toBeNull();
    expect(r.marketsCovered).toEqual(["United Arab Emirates", "Saudi Arabia", "Oman", "Jordan"]);
  });

  it("requires markets for region and niche brands", () => {
    for (const brandType of ["region", "niche"]) {
      const r = brandFormSchema.safeParse({ name: "X", brandType, country: "Something", stageId: STAGE, marketsCovered: "" });
      expect(r.success).toBe(false);
      if (r.success) continue;
      expect(fieldErrors(r.error).marketsCovered).toBeTruthy();
    }
  });

  it("drops a stray country code from a niche brand", () => {
    const r = brandFormSchema.parse({ name: "Dive Co", brandType: "niche", country: "Scuba diving", countryCode: "ID", stageId: STAGE, marketsCovered: "Scuba diving" });
    expect(r.countryCode).toBeNull();
    expect(r.marketsCovered).toEqual(["Scuba diving"]);
  });
});
