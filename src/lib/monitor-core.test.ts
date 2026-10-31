import { describe, expect, it } from "vitest";
import { buildEvent, checkUrl, duration, nextUptime, type CheckResult } from "./monitor-core";

const up: CheckResult = { ok: true, status: 200, ms: 120, error: null };
const down: CheckResult = { ok: false, status: 502, ms: 80, error: "HTTP 502" };
const url = "https://komorebi.tourground.com";

describe("nextUptime", () => {
  it("alerts only after two failures in a row, once", () => {
    const a = nextUptime(null, url, down, "2026-10-31T10:00:00Z");
    expect(a.event).toBeNull();
    const b = nextUptime(a.snap, url, down, "2026-10-31T10:10:00Z");
    expect(b.event?.action).toBe("site_down");
    expect(b.snap.downSince).toBe("2026-10-31T10:00:00Z");
    const c = nextUptime(b.snap, url, down, "2026-10-31T10:20:00Z");
    expect(c.event).toBeNull();
  });
  it("says when an alerted site is back, with how long it was down", () => {
    const b = nextUptime(nextUptime(null, url, down, "2026-10-31T10:00:00Z").snap, url, down, "2026-10-31T10:10:00Z");
    const back = nextUptime(b.snap, url, up, "2026-10-31T11:30:00Z");
    expect(back.event).toEqual({ action: "site_up", details: { url, downFor: "1 h 30 min" } });
    expect(back.snap).toMatchObject({ fails: 0, downSince: null, alerted: false, lastOkAt: "2026-10-31T11:30:00Z" });
  });
  it("stays quiet when a single failure recovers", () => {
    const a = nextUptime(null, url, down, "2026-10-31T10:00:00Z");
    expect(nextUptime(a.snap, url, up, "2026-10-31T10:10:00Z").event).toBeNull();
  });
  it("starts over when the address changes", () => {
    const a = nextUptime(null, url, down, "2026-10-31T10:00:00Z");
    expect(nextUptime(a.snap, "https://komorebi.vercel.app", down, "2026-10-31T10:10:00Z").event).toBeNull();
  });
});

describe("checkUrl", () => {
  const fake = (status: number) => (async () => new Response("x", { status })) as unknown as typeof fetch;
  it("counts 2xx and 3xx answers as up, 4xx/5xx as down, and a login wall as locked", async () => {
    expect((await checkUrl(url, fake(200))).ok).toBe(true);
    expect(await checkUrl(url, fake(404))).toMatchObject({ ok: false, error: "HTTP 404" });
    expect(await checkUrl(url, fake(401))).toMatchObject({ ok: true, locked: true });
  });
  it("reports a network failure as down", async () => {
    const boom = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await checkUrl(url, boom)).toMatchObject({ ok: false, status: null, error: "fetch failed" });
  });
});

describe("buildEvent", () => {
  it("flags a new failed build once per commit", () => {
    expect(buildEvent({ state: "READY", commitSha: "a" }, { state: "ERROR", commitSha: "b", branch: "main", commitMessage: "Add blog" })?.action).toBe("build_failed");
    expect(buildEvent({ state: "ERROR", commitSha: "b" }, { state: "ERROR", commitSha: "b" })).toBeNull();
    expect(buildEvent({ state: "ERROR", commitSha: "b" }, { state: "ERROR", commitSha: "c" })?.action).toBe("build_failed");
  });
  it("notes when a broken build is fixed", () => {
    expect(buildEvent({ state: "ERROR", commitSha: "b" }, { state: "READY", commitSha: "c" })?.action).toBe("build_fixed");
    expect(buildEvent({ state: "READY", commitSha: "a" }, { state: "READY", commitSha: "c" })).toBeNull();
  });
});

describe("duration", () => {
  it("reads naturally", () => {
    expect(duration("2026-10-31T10:00:00Z", "2026-10-31T10:12:00Z")).toBe("12 min");
    expect(duration("2026-10-31T10:00:00Z", "2026-10-31T13:00:00Z")).toBe("3 h");
    expect(duration("2026-10-29T10:00:00Z", "2026-10-31T10:00:00Z")).toBe("2 days");
  });
});
