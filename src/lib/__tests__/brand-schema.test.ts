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
    const r = brandFormSchema.parse({ name: "X", country: "Kenya", stageId: STAGE, regionId: "__none", ownerId: "__none" });
    expect(r.regionId).toBeNull();
    expect(r.ownerId).toBeNull();
  });

  it("splits content reference URLs by line", () => {
    const r = brandFormSchema.parse({ name: "X", country: "Kenya", stageId: STAGE, contentReferenceUrls: "https://a.com\n\n  https://b.com (blog) \n" });
    expect(r.contentReferenceUrls).toEqual(["https://a.com", "https://b.com (blog)"]);
  });

  it("rejects missing name and bad urls with field-level messages", () => {
    const r = brandFormSchema.safeParse({ name: "", country: "Kenya", stageId: STAGE, repoUrl: "not a url" });
    expect(r.success).toBe(false);
    if (r.success) return;
    const errs = fieldErrors(r.error);
    expect(errs.name).toMatch(/required/i);
    expect(errs.repoUrl).toMatch(/web address/i);
  });

  it("rejects logos that are not images", () => {
    const r = brandFormSchema.safeParse({ name: "X", country: "Kenya", stageId: STAGE, logoData: "data:text/plain;base64,AAAA" });
    expect(r.success).toBe(false);
  });
});
