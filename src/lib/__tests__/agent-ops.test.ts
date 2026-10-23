import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { ZodError } from "zod";
import * as schema from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import type { Db } from "@/db";
import type { Actor } from "@/lib/auth";
import {
  AgentError,
  addBlockerForAgent,
  addCommentForAgent,
  addPromptForAgent,
  createBrandForAgent,
  getAgentActor,
  getBrandForAgent,
  listBrandsBrief,
  resolveBlockerForAgent,
  setChecklistForAgent,
  setPhaseForAgent,
  setStageForAgent,
  updateBrandForAgent,
} from "@/lib/agent/ops";

let db: Db;
let claude: Actor;
beforeAll(async () => {
  db = drizzle(new PGlite(), { schema }) as unknown as Db;
  await migrate(db as never, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await seedDatabase(db);
  claude = await getAgentActor(db);
});

describe("agent API operations", () => {
  it("acts as one Claude team member, created once", async () => {
    expect(claude).toMatchObject({ name: "Claude", role: "editor" });
    expect((await getAgentActor(db)).id).toBe(claude.id);
  });

  it("lists brands by slug with stage keys and progress", async () => {
    const { stages, brands } = await listBrandsBrief(db);
    expect(stages.map((s) => s.key)).toContain("live");
    const kenya = brands.find((b) => b.slug === "safari-njema");
    expect(kenya).toMatchObject({ stage: "prompt_ready", phasesDone: "0/5", checklistDone: "0/14", openBlockers: 0 });
  });

  it("creates a country brand from an ISO code, with phases and checklist", async () => {
    const { slug } = await createBrandForAgent(db, claude, { name: "Adriatica", country: "HR", brandStory: "Sailing the Dalmatian coast." });
    expect(slug).toBe("adriatica");
    const brand = await getBrandForAgent(db, slug);
    expect(brand).toMatchObject({ country: "Croatia", countryCode: "HR", marketsCovered: ["Croatia"], region: "Europe", stage: { key: "named" } });
    expect(brand.phases).toHaveLength(5);
    expect(brand.checklist).toHaveLength(14);
    expect(brand.recentActivity[0]).toMatchObject({ by: "Claude", action: "brand_created" });

    const again = await createBrandForAgent(db, claude, { name: "Adriatica", country: "Croatia" });
    expect(again.slug).toBe("adriatica-2");
    await expect(createBrandForAgent(db, claude, { name: "X", country: "Atlantis" })).rejects.toThrow(/Unknown country/);
  });

  it("updates text fields only", async () => {
    await updateBrandForAgent(db, claude, "adriatica", { paletteNotes: "Sea blue, limestone white", stagingUrl: "https://adriatica.vercel.app" });
    expect(await getBrandForAgent(db, "adriatica")).toMatchObject({ paletteNotes: "Sea blue, limestone white", stagingUrl: "https://adriatica.vercel.app" });
    await expect(updateBrandForAgent(db, claude, "adriatica", { name: "Renamed" })).rejects.toBeInstanceOf(ZodError);
  });

  it("moves stages but keeps checklist-gated stages closed until the checklist is done", async () => {
    await setStageForAgent(db, claude, "adriatica", { stage: "Building" });
    expect((await getBrandForAgent(db, "adriatica")).stage.key).toBe("building");

    const err = await setStageForAgent(db, claude, "adriatica", { stage: "live" }).catch((e) => e);
    expect(err).toBeInstanceOf(AgentError);
    expect(err.status).toBe(409);

    const brand = await getBrandForAgent(db, "adriatica");
    for (const item of brand.checklist.filter((c) => c.required)) await setChecklistForAgent(db, claude, "adriatica", { item: item.id, done: true });
    const moved = await setStageForAgent(db, claude, "adriatica", { stage: "live" });
    expect(moved).toMatchObject({ stage: "live", changed: true });
    expect((await getBrandForAgent(db, "adriatica")).launchedAt).toBeInstanceOf(Date);
  });

  it("finds checklist items by a piece of the label and refuses ambiguous matches", async () => {
    const r = await setChecklistForAgent(db, claude, "safari-njema", { item: "lighthouse", done: true, detail: "94" });
    expect(r.item).toMatch(/Lighthouse/);
    const item = (await getBrandForAgent(db, "safari-njema")).checklist.find((c) => c.label === r.item)!;
    expect(item).toMatchObject({ done: true, detail: "94" });
    await expect(setChecklistForAgent(db, claude, "safari-njema", { item: "checked", done: true })).rejects.toThrow(/matches 2 items/);
  });

  it("updates phases, blockers, comments and prompts with activity entries", async () => {
    await setPhaseForAgent(db, claude, "safari-njema", { phase: 1, status: "done", notes: "Tokens in place" });
    const { id } = await addBlockerForAgent(db, claude, "safari-njema", { description: "Need real lodge photos", waitingOn: "team" });
    await addCommentForAgent(db, claude, "safari-njema", { body: "Homepage copy drafted, see PR." });
    expect(await addPromptForAgent(db, claude, "safari-njema", { body: "Build Safari Njema…", changeNotes: "first draft" })).toMatchObject({ version: 1 });
    expect(await addPromptForAgent(db, claude, "safari-njema", { body: "Build Safari Njema v2" })).toMatchObject({ version: 2 });

    let brand = await getBrandForAgent(db, "safari-njema");
    expect(brand.phases[0]).toMatchObject({ status: "done", notes: "Tokens in place" });
    expect(brand.openBlockers).toEqual([expect.objectContaining({ id, waitingOn: "team" })]);
    expect(brand.openComments[0]).toMatchObject({ author: "Claude", body: "Homepage copy drafted, see PR." });
    expect(brand.latestPrompt).toMatchObject({ version: 2, body: "Build Safari Njema v2" });

    await resolveBlockerForAgent(db, claude, "safari-njema", { id });
    brand = await getBrandForAgent(db, "safari-njema");
    expect(brand.openBlockers).toEqual([]);
    expect(brand.recentActivity.map((a) => a.action)).toEqual(
      expect.arrayContaining(["phase_done", "blocker_opened", "blocker_resolved", "note_added", "prompt_saved", "checklist_ticked"]),
    );
  });

  it("explains unknown slugs and stages", async () => {
    await expect(getBrandForAgent(db, "nope")).rejects.toMatchObject({ status: 404 });
    await expect(setStageForAgent(db, claude, "safari-njema", { stage: "launched" })).rejects.toThrow(/Stages: idea, named/);
  });
});
