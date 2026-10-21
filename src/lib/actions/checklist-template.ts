"use server";

import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { checklistTemplateItems } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import type { ActionResult } from "./brands";
import { syncBrandChecklist } from "./checklist";

const labelSchema = z.string().trim().min(1, "Label is required.").max(300);
const detailLabelSchema = z.string().trim().max(120).nullable().optional();

export async function addTemplateItem(input: { label: string; required: boolean; detailLabel?: string | null }): Promise<ActionResult> {
  try {
    await requireRole("owner");
    const label = labelSchema.safeParse(input.label);
    if (!label.success) return { ok: false, error: label.error.issues[0]?.message ?? "Invalid label." };
    const detailLabel = detailLabelSchema.parse(input.detailLabel) || null;
    const db = await getDb();
    const rows = await db.query.checklistTemplateItems.findMany({ columns: { sortOrder: true } });
    const sortOrder = Math.max(0, ...rows.map((r) => r.sortOrder)) + 10;
    await db.insert(checklistTemplateItems).values({ label: label.data, required: Boolean(input.required), detailLabel, sortOrder });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function updateTemplateItem(id: string, input: { label?: string; required?: boolean; detailLabel?: string | null; active?: boolean }): Promise<ActionResult> {
  try {
    await requireRole("owner");
    const patch: Partial<typeof checklistTemplateItems.$inferInsert> = { updatedAt: new Date() };
    if (input.label !== undefined) {
      const label = labelSchema.safeParse(input.label);
      if (!label.success) return { ok: false, error: label.error.issues[0]?.message ?? "Invalid label." };
      patch.label = label.data;
    }
    if (input.required !== undefined) patch.required = input.required;
    if (input.detailLabel !== undefined) patch.detailLabel = detailLabelSchema.parse(input.detailLabel) || null;
    if (input.active !== undefined) patch.active = input.active;
    const db = await getDb();
    await db.update(checklistTemplateItems).set(patch).where(eq(checklistTemplateItems.id, id));
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function moveTemplateItem(id: string, direction: "up" | "down"): Promise<ActionResult> {
  try {
    await requireRole("owner");
    const db = await getDb();
    const rows = await db.query.checklistTemplateItems.findMany({ orderBy: [asc(checklistTemplateItems.sortOrder)] });
    const i = rows.findIndex((r) => r.id === id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= rows.length) return { ok: true };
    await db.update(checklistTemplateItems).set({ sortOrder: rows[j].sortOrder }).where(eq(checklistTemplateItems.id, rows[i].id));
    await db.update(checklistTemplateItems).set({ sortOrder: rows[i].sortOrder }).where(eq(checklistTemplateItems.id, rows[j].id));
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

/** Push new template items to every brand that doesn't have them yet. */
export async function applyTemplateToAllBrands(): Promise<{ ok: true; brandsUpdated: number; itemsAdded: number } | { ok: false; error: string }> {
  try {
    await requireRole("owner");
    const db = await getDb();
    const all = await db.query.brands.findMany({ columns: { id: true } });
    let brandsUpdated = 0;
    let itemsAdded = 0;
    for (const b of all) {
      const n = await syncBrandChecklist(db, b.id);
      if (n > 0) {
        brandsUpdated++;
        itemsAdded += n;
      }
    }
    revalidatePath("/settings");
    revalidatePath("/brands");
    revalidatePath("/pipeline");
    return { ok: true, brandsUpdated, itemsAdded };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
