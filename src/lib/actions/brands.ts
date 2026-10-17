"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { initializeBrandChildren } from "@/db/seed";
import { brands, buildPhases, pipelineStages, type PhaseStatus } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { PHASE_STATUSES } from "@/lib/constants";
import { getMissingChecklistItems } from "@/lib/data/brands";
import { brandFormSchema, fieldErrors } from "@/lib/schemas/brand";
import { slugify } from "@/lib/utils";
import { logActivity } from "./activity";

export type BrandFormState = { errors?: Record<string, string>; message?: string } | undefined;

function formToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const db = await getDb();
  let slug = base || "brand";
  for (let i = 2; i < 100; i++) {
    const clash = await db.query.brands.findFirst({
      where: excludeId ? and(eq(brands.slug, slug), ne(brands.id, excludeId)) : eq(brands.slug, slug),
      columns: { id: true },
    });
    if (!clash) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

export async function createBrand(_prev: BrandFormState, formData: FormData): Promise<BrandFormState> {
  const actor = await requireRole("editor");
  const parsed = brandFormSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const db = await getDb();
  const slug = await uniqueSlug(slugify(v.name));
  const [row] = await db
    .insert(brands)
    .values({
      name: v.name,
      slug,
      brandType: v.brandType,
      marketsCovered: v.marketsCovered,
      country: v.country,
      countryCode: v.countryCode ?? null,
      regionId: v.regionId ?? null,
      stageId: v.stageId,
      designReference: v.designReference,
      designReferenceUrl: v.designReferenceUrl ?? null,
      contentReferenceUrls: v.contentReferenceUrls,
      brandStory: v.brandStory ?? null,
      paletteNotes: v.paletteNotes ?? null,
      ownerId: v.ownerId ?? null,
      priority: v.priority,
      targetLaunchDate: v.targetLaunchDate ?? null,
      repoUrl: v.repoUrl ?? null,
      vercelProjectUrl: v.vercelProjectUrl ?? null,
      stagingUrl: v.stagingUrl ?? null,
      productionDomain: v.productionDomain ?? null,
      logoUrl: v.logoUrl ?? null,
      logoData: v.logoData || null,
    })
    .returning({ id: brands.id, slug: brands.slug });
  await initializeBrandChildren(db, row.id);
  await logActivity(db, row.id, actor, "brand_created", { name: v.name });
  revalidatePath("/");
  revalidatePath("/brands");
  redirect(`/brands/${row.slug}`);
}

export async function updateBrand(brandId: string, _prev: BrandFormState, formData: FormData): Promise<BrandFormState> {
  const actor = await requireRole("editor");
  const parsed = brandFormSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const db = await getDb();
  const existing = await db.query.brands.findFirst({ where: eq(brands.id, brandId), with: { stage: true } });
  if (!existing) return { message: "Brand not found." };

  if (v.stageId !== existing.stageId) {
    const blocked = await stageChangeBlockers(brandId, v.stageId);
    if (blocked) return { errors: { stageId: blocked } };
  }

  const slug = existing.name === v.name ? existing.slug : await uniqueSlug(slugify(v.name), brandId);
  const newStage = v.stageId !== existing.stageId ? await db.query.pipelineStages.findFirst({ where: eq(pipelineStages.id, v.stageId) }) : null;

  await db
    .update(brands)
    .set({
      name: v.name,
      slug,
      brandType: v.brandType,
      marketsCovered: v.marketsCovered,
      country: v.country,
      countryCode: v.countryCode ?? null,
      regionId: v.regionId ?? null,
      stageId: v.stageId,
      designReference: v.designReference,
      designReferenceUrl: v.designReferenceUrl ?? null,
      contentReferenceUrls: v.contentReferenceUrls,
      brandStory: v.brandStory ?? null,
      paletteNotes: v.paletteNotes ?? null,
      ownerId: v.ownerId ?? null,
      priority: v.priority,
      targetLaunchDate: v.targetLaunchDate ?? null,
      repoUrl: v.repoUrl ?? null,
      vercelProjectUrl: v.vercelProjectUrl ?? null,
      stagingUrl: v.stagingUrl ?? null,
      productionDomain: v.productionDomain ?? null,
      logoUrl: v.logoUrl ?? null,
      ...(v.logoData === undefined ? {} : { logoData: v.logoData || null }),
      ...(newStage?.countsAsLive && !existing.launchedAt ? { launchedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(brands.id, brandId));

  await logActivity(db, brandId, actor, "brand_updated", { name: v.name });
  if (newStage) {
    await logActivity(db, brandId, actor, "status_changed", { from: existing.stage.name, to: newStage.name });
  }
  revalidatePath("/");
  revalidatePath("/brands");
  revalidatePath(`/brands/${slug}`);
  redirect(`/brands/${slug}`);
}

/** Returns a human-readable reason if the brand can't move into this stage, else null. */
async function stageChangeBlockers(brandId: string, stageId: string): Promise<string | null> {
  const db = await getDb();
  const stage = await db.query.pipelineStages.findFirst({ where: eq(pipelineStages.id, stageId) });
  if (!stage) return "That stage doesn't exist.";
  if (!stage.requiresChecklist) return null;
  const missing = await getMissingChecklistItems(brandId);
  if (missing.length === 0) return null;
  const preview = missing
    .slice(0, 3)
    .map((m) => m.label)
    .join("; ");
  return `Can't move to "${stage.name}" yet: ${missing.length} required checklist item${missing.length === 1 ? "" : "s"} still open (${preview}${missing.length > 3 ? "; …" : ""}).`;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function changeStage(brandId: string, stageId: string): Promise<ActionResult> {
  try {
    const actor = await requireRole("editor");
    const db = await getDb();
    const existing = await db.query.brands.findFirst({ where: eq(brands.id, brandId), with: { stage: true } });
    if (!existing) return { ok: false, error: "Brand not found." };
    if (existing.stageId === stageId) return { ok: true };
    const blocked = await stageChangeBlockers(brandId, stageId);
    if (blocked) return { ok: false, error: blocked };
    const stage = (await db.query.pipelineStages.findFirst({ where: eq(pipelineStages.id, stageId) }))!;
    await db
      .update(brands)
      .set({ stageId, updatedAt: new Date(), ...(stage.countsAsLive && !existing.launchedAt ? { launchedAt: new Date() } : {}) })
      .where(eq(brands.id, brandId));
    await logActivity(db, brandId, actor, "status_changed", { from: existing.stage.name, to: stage.name });
    revalidatePath("/");
    revalidatePath("/brands");
    revalidatePath("/pipeline");
    revalidatePath(`/brands/${existing.slug}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

const phaseInput = z.object({
  status: z.enum(PHASE_STATUSES),
  notes: z.string().max(5000).optional(),
});

export async function updatePhase(phaseId: string, input: { status: PhaseStatus; notes?: string }): Promise<ActionResult> {
  try {
    const actor = await requireRole("editor");
    const v = phaseInput.parse(input);
    const db = await getDb();
    const phase = await db.query.buildPhases.findFirst({ where: eq(buildPhases.id, phaseId), with: { brand: { columns: { slug: true, id: true } } } });
    if (!phase) return { ok: false, error: "Phase not found." };
    await db
      .update(buildPhases)
      .set({
        status: v.status,
        notes: v.notes === undefined ? phase.notes : v.notes || null,
        completedAt: v.status === "done" ? (phase.completedAt ?? new Date()) : null,
        updatedAt: new Date(),
      })
      .where(eq(buildPhases.id, phaseId));
    await db.update(brands).set({ updatedAt: new Date() }).where(eq(brands.id, phase.brandId));
    if (v.status !== phase.status) {
      await logActivity(db, phase.brandId, actor, v.status === "done" ? "phase_done" : "phase_updated", { phase: phase.phaseNumber, name: phase.name, status: v.status });
    }
    revalidatePath(`/brands/${phase.brand.slug}`);
    revalidatePath("/brands");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function deleteBrand(brandId: string): Promise<ActionResult> {
  try {
    await requireRole("owner");
    const db = await getDb();
    await db.delete(brands).where(eq(brands.id, brandId));
    revalidatePath("/");
    revalidatePath("/brands");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

