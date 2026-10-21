import { beforeAll, describe, expect, it } from "vitest";
import { syncHealth, type SyncState } from "@/lib/sync";
import type { SyncSummary } from "@/lib/sync/engine";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const run = (patch: Partial<SyncSummary> = {}): SyncSummary => ({ at: "2026-10-21T11:59:00Z", ok: true, warnings: [], added: [], linked: [], advanced: [], queued: 0, vercelProjects: 30, githubRepos: 50, durationMs: 900, ...patch });

describe("sync health on the Overview", () => {
  beforeAll(() => {
    process.env.VERCEL_TOKEN = "test";
  });

  it("says nothing when the last run was fine", () => {
    expect(syncHealth({ last: run() }, NOW)?.tone).toBe("ok");
  });

  it("flags a run that failed, and projects that were skipped", () => {
    expect(syncHealth({ last: run({ ok: false, error: "Vercel said 401" }) }, NOW)).toMatchObject({ tone: "error", text: expect.stringContaining("Vercel said 401") });
    expect(syncHealth({ last: run({ warnings: ["Mystery: boom"] }) }, NOW)).toMatchObject({ tone: "warn", text: expect.stringContaining("1 project") });
  });

  it("flags a sync that has been skipped for over 10 minutes", () => {
    const stuck: SyncState = { last: run({ at: "2026-10-20T12:10:00Z" }), skippedSince: "2026-10-20T12:11:00Z" };
    expect(syncHealth(stuck, NOW)).toMatchObject({ tone: "error", text: expect.stringContaining("stuck") });
    expect(syncHealth({ ...stuck, skippedSince: "2026-10-21T11:58:00Z" }, NOW)?.tone).toBe("ok");
  });
});
