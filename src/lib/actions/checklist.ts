"use server";

import { revalidatePath } from "next/cache";
import { and, eq, notInArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Db } from "@/db";
import { brandChecklistItems, brands, checklistTemplateItems } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import type { ActionResult } from "./brands";
import { logActivity } from "./activity";

function revalidateBrand(slug: string) {
  revalidatePath(`/brands/${slug}`);
  revalidatePath("/brands");
  revalidatePath("/pipeline");
  revalidatePath("/", "layout");
}

export async function setChecklistDone(itemId: string, done: boolean): Promise<ActionResult> {
  try {
    const actor = await requireRole("editor");
    const db = await getDb();
    const item = await db.query.brandChecklistItems.findFirst({ where: eq(brandChecklistItems.id, itemId), with: { brand: { columns: { slug: true } } } });
    if (!item) return { ok: false, error: "Checklist item not found." };
    if (item.done === done) return { ok: true };
    await db.update(brandChecklistItems).set({ done, doneAt: done ? new Date() : null, updatedAt: new Date() }).where(eq(brandChecklistItems.id, itemId));
    await db.update(brands).set({ updatedAt: new Date() }).where(eq(brands.id, item.brandId));
    await logActivity(db, item.brandId, actor, done ? "checklist_ticked" : "checklist_unticked", { label: item.label });
    revalidateBrand(item.brand.slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

const detailsInput = z.object({ detail: z.string().max(500).optional(), note: z.string().max(2000).optional() });

export async function updateChecklistDetails(itemId: string, input: { detail?: string; note?: string }): Promise<ActionResult> {
  try {
    await requireRole("editor");
    const v = detailsInput.parse(input);
    const db = await getDb();
    const item = await db.query.brandChecklistItems.findFirst({ where: eq(brandChecklistItems.id, itemId), with: { brand: { columns: { slug: true } } } });
    if (!item) return { ok: false, error: "Checklist item not found." };
    await db
      .update(brandChecklistItems)
      .set({
        ...(v.detail === undefined ? {} : { detail: v.detail.trim() || null }),
        ...(v.note === undefined ? {} : { note: v.note.trim() || null }),
        updatedAt: new Date(),
      })
      .where(eq(brandChecklistItems.id, itemId));
    revalidateBrand(item.brand.slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

/** Add active template items this brand doesn't have yet. */
export async function addMissingTemplateItems(brandId: string): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  try {
    await requireRole("editor");
    const db = await getDb();
    const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId), columns: { slug: true } });
    if (!brand) return { ok: false, error: "Brand not found." };
    const added = await syncBrandChecklist(db, brandId);
    revalidateBrand(brand.slug);
    return { ok: true, added };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function syncBrandChecklist(db: Db, brandId: string): Promise<number> {
  const existing = await db.query.brandChecklistItems.findMany({ where: eq(brandChecklistItems.brandId, brandId), columns: { templateItemId: true } });
  const have = existing.map((e) => e.templateItemId).filter((x): x is string => Boolean(x));
  const missing = await db.query.checklistTemplateItems.findMany({
    where: have.length ? and(eq(checklistTemplateItems.active, true), notInArray(checklistTemplateItems.id, have)) : eq(checklistTemplateItems.active, true),
    orderBy: (t, { asc }) => [asc(t.sortOrder)],
  });
  if (missing.length === 0) return 0;
  await db.insert(brandChecklistItems).values(
    missing.map((t) => ({ brandId, templateItemId: t.id, label: t.label, required: t.required, detailLabel: t.detailLabel, sortOrder: t.sortOrder })),
  );
  return missing.length;
}
