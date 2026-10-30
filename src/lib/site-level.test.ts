import { describe, expect, it } from "vitest";
import { siteLevel } from "./site-level";

const base = { repoUrl: null, vercelProjectUrl: null, vercelProjectId: null, stagingUrl: null, productionDomain: null, stage: { countsAsLive: false } };

describe("siteLevel", () => {
  it("is not started with nothing linked", () => {
    expect(siteLevel(base)).toEqual({ level: "idea", url: null });
  });
  it("is GitHub only with just a repo", () => {
    expect(siteLevel({ ...base, repoUrl: "https://github.com/x/kenya" })).toEqual({ level: "repo", url: "https://github.com/x/kenya" });
  });
  it("is a preview on a vercel.app link", () => {
    expect(siteLevel({ ...base, repoUrl: "r", stagingUrl: "https://kenya.vercel.app" }).level).toBe("preview");
    expect(siteLevel({ ...base, productionDomain: "kenya-abc.vercel.app" })).toEqual({ level: "preview", url: "kenya-abc.vercel.app" });
    expect(siteLevel({ ...base, vercelProjectId: "prj_1" }).level).toBe("preview");
  });
  it("is live on its own domain or in a live stage", () => {
    expect(siteLevel({ ...base, stagingUrl: "https://kenya.vercel.app", productionDomain: "https://safarinjema.com" })).toEqual({ level: "live", url: "https://safarinjema.com" });
    expect(siteLevel({ ...base, stage: { countsAsLive: true } }).level).toBe("live");
  });
});
