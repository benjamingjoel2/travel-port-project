import "server-only";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { initializeBrandChildren } from "@/db/seed";
import { blockers, brandChecklistItems, brands, buildPhases, notes, pipelineStages, prompts, regions, teamMembers } from "@/db/schema";
import type { Actor } from "@/lib/auth";
import { logActivity } from "@/lib/actions/activity";
import { BRAND_TYPES, DESIGN_REFERENCES, PHASE_STATUSES, PRIORITIES, WAITING_ON_OPTIONS } from "@/lib/constants";
import { countryByCode, countryByName } from "@/lib/countries";
import { regionForCountry } from "@/lib/sync/regions";
import { slugify } from "@/lib/utils";

/**
 * What the Claude Code agents can read and change in the tracker. Same rules as the
 * UI (checklist-gated stages, activity log, launchedAt), but keyed by slug, stage key
 * and checklist label so an agent never has to juggle uuids.
 */

export class AgentError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const AGENT_DEFAULT_NAME = "Claude";

/** The team member the agents act as. Created on first use (editor, no login). */
export async function getAgentActor(db: Db, name = AGENT_DEFAULT_NAME): Promise<Actor> {
  const existing = await db.query.teamMembers.findFirst({ where: eq(teamMembers.name, name) });
  if (existing) return { id: existing.id, name: existing.name, role: existing.role };
  const [row] = await db.insert(teamMembers).values({ name, role: "editor" }).returning();
  return { id: row.id, name: row.name, role: row.role };
}

async function brandBySlug(db: Db, slug: string) {
  const brand = await db.query.brands.findFirst({ where: eq(brands.slug, slug), with: { stage: true } });
  if (!brand) throw new AgentError(`No brand with slug "${slug}". GET /api/agent/brands lists them.`, 404);
  return brand;
}

async function touch(db: Db, brandId: string) {
  await db.update(brands).set({ updatedAt: new Date() }).where(eq(brands.id, brandId));
}

/* ---------- reads ---------- */

export async function listBrandsBrief(db: Db) {
  const [stageRows, rows] = await Promise.all([
    db.query.pipelineStages.findMany({ orderBy: [asc(pipelineStages.sortOrder)] }),
    db.query.brands.findMany({
      columns: { name: true, slug: true, brandType: true, country: true, countryCode: true, priority: true, repoUrl: true, githubRepo: true, stagingUrl: true, productionDomain: true },
      with: {
        stage: { columns: { key: true, name: true } },
        phases: { columns: { status: true } },
        checklist: { columns: { done: true, required: true } },
        blockers: { columns: { resolvedAt: true } },
      },
      orderBy: [asc(brands.name)],
    }),
  ]);
  return {
    stages: stageRows.map((s) => ({ key: s.key, name: s.name, requiresChecklist: s.requiresChecklist, countsAsLive: s.countsAsLive, isTerminal: s.isTerminal })),
    brands: rows.map(({ phases, checklist, blockers: b, stage, ...rest }) => ({
      ...rest,
      stage: stage.key,
      phasesDone: `${phases.filter((p) => p.status === "done").length}/${phases.length}`,
      checklistDone: `${checklist.filter((c) => c.done).length}/${checklist.length}`,
      openBlockers: b.filter((x) => !x.resolvedAt).length,
    })),
  };
}

export async function getBrandForAgent(db: Db, slug: string) {
  const brand = await db.query.brands.findFirst({
    where: eq(brands.slug, slug),
    columns: { logoData: false },
    with: {
      stage: true,
      region: { columns: { name: true } },
      owner: { columns: { name: true } },
      phases: { orderBy: (p, { asc }) => [asc(p.phaseNumber)] },
      checklist: { orderBy: (c, { asc }) => [asc(c.sortOrder)] },
      prompts: { orderBy: (p, { desc }) => [desc(p.version)], limit: 1 },
      notes: { where: isNull(notes.doneAt), with: { author: { columns: { name: true } } }, orderBy: (n, { desc }) => [desc(n.createdAt)] },
      blockers: { where: isNull(blockers.resolvedAt), orderBy: (b, { desc }) => [desc(b.openedAt)] },
      activity: { orderBy: (a, { desc }) => [desc(a.createdAt)], limit: 15 },
    },
  });
  if (!brand) throw new AgentError(`No brand with slug "${slug}". GET /api/agent/brands lists them.`, 404);
  const { stage, region, owner, phases, checklist, prompts: latestPrompt, notes: openNotes, blockers: openBlockers, activity, ...fields } = brand;
  return {
    ...fields,
    stage: { key: stage.key, name: stage.name },
    region: region?.name ?? null,
    owner: owner?.name ?? null,
    phases: phases.map((p) => ({ number: p.phaseNumber, name: p.name, status: p.status, notes: p.notes })),
    checklist: checklist.map((c) => ({ id: c.id, label: c.label, required: c.required, done: c.done, detailLabel: c.detailLabel, detail: c.detail, note: c.note })),
    latestPrompt: latestPrompt[0] ? { version: latestPrompt[0].version, body: latestPrompt[0].body, changeNotes: latestPrompt[0].changeNotes } : null,
    openComments: openNotes.map((n) => ({ id: n.id, author: n.author?.name ?? null, body: n.body, createdAt: n.createdAt })),
    openBlockers: openBlockers.map((b) => ({ id: b.id, description: b.description, waitingOn: b.waitingOn, openedAt: b.openedAt })),
    recentActivity: activity.map((a) => ({ at: a.createdAt, by: a.actorName, action: a.action, details: a.details })),
  };
}

/* ---------- writes ---------- */

export const createBrandInput = z.object({
  name: z.string().trim().min(1).max(120),
  brandType: z.enum(BRAND_TYPES).default("country"),
  /** Country brands: ISO code ("KE") or country name. Region/niche brands: the region or niche label. */
  country: z.string().trim().min(1).max(120),
  marketsCovered: z.array(z.string().trim().min(1)).default([]),
  stage: z.string().default("named"),
  priority: z.enum(PRIORITIES).default("medium"),
  designReference: z.enum(DESIGN_REFERENCES).default("atlas"),
  brandStory: z.string().max(20000).optional(),
  paletteNotes: z.string().max(5000).optional(),
  repoUrl: z.url().optional(),
});

export async function createBrandForAgent(db: Db, actor: Actor, raw: unknown) {
  const v = createBrandInput.parse(raw);
  let country = v.country;
  let countryCode: string | null = null;
  if (v.brandType === "country") {
    const match = countryByCode(v.country) ?? countryByName(v.country);
    if (!match) throw new AgentError(`Unknown country "${v.country}". Use an ISO code like "KE" or the English name.`);
    country = match.name;
    countryCode = match.code;
  } else if (v.marketsCovered.length === 0) {
    throw new AgentError(v.brandType === "region" ? "List the countries this brand covers in marketsCovered." : "List the activities in marketsCovered.");
  }
  const stage = await stageByKeyOrName(db, v.stage);
  const regionName = regionForCountry(countryCode);
  const region = regionName ? await db.query.regions.findFirst({ where: eq(regions.name, regionName) }) : undefined;

  const base = slugify(v.name) || "brand";
  let slug = base;
  for (let i = 2; await db.query.brands.findFirst({ where: eq(brands.slug, slug), columns: { id: true } }); i++) slug = `${base}-${i}`;

  const [row] = await db
    .insert(brands)
    .values({
      name: v.name,
      slug,
      brandType: v.brandType,
      country,
      countryCode,
      marketsCovered: v.brandType === "country" && v.marketsCovered.length === 0 ? [country] : v.marketsCovered,
      regionId: region?.id ?? null,
      stageId: stage.id,
      priority: v.priority,
      designReference: v.designReference,
      brandStory: v.brandStory ?? null,
      paletteNotes: v.paletteNotes ?? null,
      repoUrl: v.repoUrl ?? null,
    })
    .returning({ id: brands.id, slug: brands.slug });
  await initializeBrandChildren(db, row.id);
  await logActivity(db, row.id, actor, "brand_created", { name: v.name });
  return { slug: row.slug };
}

const updateBrandInput = z
  .object({
    brandStory: z.string().max(20000).nullable(),
    paletteNotes: z.string().max(5000).nullable(),
    repoUrl: z.url().nullable(),
    stagingUrl: z.url().nullable(),
    productionDomain: z.string().trim().max(253).nullable(),
    designReferenceUrl: z.url().nullable(),
    contentReferenceUrls: z.array(z.string().trim().min(1)),
  })
  .partial()
  .strict();

/** Fills in the brand's text fields. Name, type and owner stay with the humans (Edit page). */
export async function updateBrandForAgent(db: Db, actor: Actor, slug: string, raw: unknown) {
  const v = updateBrandInput.parse(raw);
  const brand = await brandBySlug(db, slug);
  const fields = Object.keys(v);
  if (fields.length === 0) throw new AgentError("Nothing to update.");
  await db
    .update(brands)
    .set({ ...v, updatedAt: new Date() })
    .where(eq(brands.id, brand.id));
  await logActivity(db, brand.id, actor, "brand_updated", { name: brand.name, fields });
  return { ok: true as const };
}

async function stageByKeyOrName(db: Db, keyOrName: string) {
  const wanted = keyOrName.trim().toLowerCase();
  const stages = await db.query.pipelineStages.findMany();
  const stage = stages.find((s) => s.key === wanted || s.name.toLowerCase() === wanted);
  if (!stage) throw new AgentError(`Unknown stage "${keyOrName}". Stages: ${stages.map((s) => s.key).join(", ")}.`);
  return stage;
}

export async function setStageForAgent(db: Db, actor: Actor, slug: string, raw: unknown) {
  const { stage: wanted } = z.object({ stage: z.string().min(1) }).parse(raw);
  const brand = await brandBySlug(db, slug);
  const stage = await stageByKeyOrName(db, wanted);
  if (stage.id === brand.stageId) return { ok: true as const, stage: stage.key, changed: false };
  if (stage.requiresChecklist) {
    const missing = await db.query.brandChecklistItems.findMany({
      where: and(eq(brandChecklistItems.brandId, brand.id), eq(brandChecklistItems.required, true), eq(brandChecklistItems.done, false)),
      orderBy: [asc(brandChecklistItems.sortOrder)],
    });
    if (missing.length) {
      throw new AgentError(`Can't move to "${stage.name}" yet: ${missing.length} required checklist item(s) still open: ${missing.map((m) => m.label).join("; ")}`, 409);
    }
  }
  await db
    .update(brands)
    .set({ stageId: stage.id, updatedAt: new Date(), ...(stage.countsAsLive && !brand.launchedAt ? { launchedAt: new Date() } : {}) })
    .where(eq(brands.id, brand.id));
  await logActivity(db, brand.id, actor, "status_changed", { from: brand.stage.name, to: stage.name });
  return { ok: true as const, stage: stage.key, changed: true };
}

export async function setPhaseForAgent(db: Db, actor: Actor, slug: string, raw: unknown) {
  const v = z.object({ phase: z.number().int().min(1), status: z.enum(PHASE_STATUSES), notes: z.string().max(5000).optional() }).parse(raw);
  const brand = await brandBySlug(db, slug);
  const phase = await db.query.buildPhases.findFirst({ where: and(eq(buildPhases.brandId, brand.id), eq(buildPhases.phaseNumber, v.phase)) });
  if (!phase) throw new AgentError(`Brand "${slug}" has no phase ${v.phase}.`, 404);
  await db
    .update(buildPhases)
    .set({
      status: v.status,
      notes: v.notes === undefined ? phase.notes : v.notes || null,
      completedAt: v.status === "done" ? (phase.completedAt ?? new Date()) : null,
      updatedAt: new Date(),
    })
    .where(eq(buildPhases.id, phase.id));
  await touch(db, brand.id);
  if (v.status !== phase.status) {
    await logActivity(db, brand.id, actor, v.status === "done" ? "phase_done" : "phase_updated", { phase: phase.phaseNumber, name: phase.name, status: v.status });
  }
  return { ok: true as const };
}

export async function setChecklistForAgent(db: Db, actor: Actor, slug: string, raw: unknown) {
  const v = z
    .object({
      /** Item id, or a piece of its label ("lighthouse"). Must match exactly one item. */
      item: z.string().trim().min(1),
      done: z.boolean().optional(),
      detail: z.string().max(500).optional(),
      note: z.string().max(2000).optional(),
    })
    .parse(raw);
  const brand = await brandBySlug(db, slug);
  const items = await db.query.brandChecklistItems.findMany({ where: eq(brandChecklistItems.brandId, brand.id) });
  const needle = v.item.toLowerCase();
  const byId = items.find((i) => i.id === v.item);
  const matches = byId ? [byId] : items.filter((i) => i.label.toLowerCase().includes(needle));
  if (matches.length !== 1) {
    throw new AgentError(
      matches.length === 0 ? `No checklist item matches "${v.item}".` : `"${v.item}" matches ${matches.length} items: ${matches.map((m) => m.label).join(" | ")}. Use the id or a longer phrase.`,
      matches.length === 0 ? 404 : 409,
    );
  }
  const item = matches[0];
  await db
    .update(brandChecklistItems)
    .set({
      ...(v.done === undefined ? {} : { done: v.done, doneAt: v.done ? (item.doneAt ?? new Date()) : null }),
      ...(v.detail === undefined ? {} : { detail: v.detail.trim() || null }),
      ...(v.note === undefined ? {} : { note: v.note.trim() || null }),
      updatedAt: new Date(),
    })
    .where(eq(brandChecklistItems.id, item.id));
  await touch(db, brand.id);
  if (v.done !== undefined && v.done !== item.done) {
    await logActivity(db, brand.id, actor, v.done ? "checklist_ticked" : "checklist_unticked", { label: item.label });
  }
  return { ok: true as const, item: item.label };
}

export async function addBlockerForAgent(db: Db, actor: Actor, slug: string, raw: unknown) {
  const v = z.object({ description: z.string().trim().min(1).max(2000), waitingOn: z.enum(WAITING_ON_OPTIONS).default("me") }).parse(raw);
  const brand = await brandBySlug(db, slug);
  const [row] = await db.insert(blockers).values({ brandId: brand.id, description: v.description, waitingOn: v.waitingOn, createdById: actor.id }).returning({ id: blockers.id });
  await touch(db, brand.id);
  await logActivity(db, brand.id, actor, "blocker_opened", { description: v.description.slice(0, 120), waitingOn: v.waitingOn });
  return { ok: true as const, id: row.id };
}

export async function resolveBlockerForAgent(db: Db, actor: Actor, slug: string, raw: unknown) {
  const { id } = z.object({ id: z.uuid() }).parse(raw);
  const brand = await brandBySlug(db, slug);
  const blocker = await db.query.blockers.findFirst({ where: and(eq(blockers.id, id), eq(blockers.brandId, brand.id)) });
  if (!blocker) throw new AgentError(`Brand "${slug}" has no blocker ${id}.`, 404);
  if (blocker.resolvedAt) return { ok: true as const };
  await db.update(blockers).set({ resolvedAt: new Date(), updatedAt: new Date() }).where(eq(blockers.id, id));
  await touch(db, brand.id);
  await logActivity(db, brand.id, actor, "blocker_resolved", { description: blocker.description.slice(0, 120) });
  return { ok: true as const };
}

export async function addCommentForAgent(db: Db, actor: Actor, slug: string, raw: unknown) {
  const { body } = z.object({ body: z.string().trim().min(1).max(5000) }).parse(raw);
  const brand = await brandBySlug(db, slug);
  const [row] = await db.insert(notes).values({ brandId: brand.id, authorId: actor.id, body }).returning({ id: notes.id });
  await touch(db, brand.id);
  await logActivity(db, brand.id, actor, "note_added", { body: body.slice(0, 120) });
  return { ok: true as const, id: row.id };
}

export async function addPromptForAgent(db: Db, actor: Actor, slug: string, raw: unknown) {
  const v = z.object({ body: z.string().trim().min(1).max(100000), changeNotes: z.string().max(2000).optional() }).parse(raw);
  const brand = await brandBySlug(db, slug);
  const [{ value: latest }] = await db.select({ value: max(prompts.version) }).from(prompts).where(eq(prompts.brandId, brand.id));
  const version = (latest ?? 0) + 1;
  await db.insert(prompts).values({ brandId: brand.id, version, body: v.body, changeNotes: v.changeNotes ?? null, createdById: actor.id });
  await touch(db, brand.id);
  await logActivity(db, brand.id, actor, "prompt_saved", { version });
  return { ok: true as const, version };
}

