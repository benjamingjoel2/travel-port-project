"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { blockers, brands } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { WAITING_ON_OPTIONS } from "@/lib/constants";
import type { ActionResult } from "./brands";
import { logActivity } from "./activity";

function revalidateBrand(slug: string) {
  revalidatePath(`/brands/${slug}`);
  revalidatePath("/brands");
  revalidatePath("/pipeline");
  revalidatePath("/");
}

const blockerInput = z.object({
  description: z.string().trim().min(1, "Describe the blocker.").max(2000),
  waitingOn: z.enum(WAITING_ON_OPTIONS),
});

export async function addBlocker(brandId: string, input: { description: string; waitingOn: string }): Promise<ActionResult> {
  try {
    const actor = await requireRole("editor");
    const parsed = blockerInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    const db = await getDb();
    const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId), columns: { slug: true } });
    if (!brand) return { ok: false, error: "Brand not found." };
    await db.insert(blockers).values({ brandId, description: parsed.data.description, waitingOn: parsed.data.waitingOn, createdById: actor.id });
    await db.update(brands).set({ updatedAt: new Date() }).where(eq(brands.id, brandId));
    await logActivity(db, brandId, actor, "blocker_opened", { description: parsed.data.description.slice(0, 120), waitingOn: parsed.data.waitingOn });
    revalidateBrand(brand.slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function setBlockerResolved(blockerId: string, resolved: boolean): Promise<ActionResult> {
  try {
    const actor = await requireRole("editor");
    const db = await getDb();
    const blocker = await db.query.blockers.findFirst({ where: eq(blockers.id, blockerId), with: { brand: { columns: { slug: true } } } });
    if (!blocker) return { ok: false, error: "Blocker not found." };
    await db.update(blockers).set({ resolvedAt: resolved ? new Date() : null, updatedAt: new Date() }).where(eq(blockers.id, blockerId));
    await db.update(brands).set({ updatedAt: new Date() }).where(eq(brands.id, blocker.brandId));
    await logActivity(db, blocker.brandId, actor, resolved ? "blocker_resolved" : "blocker_reopened", { description: blocker.description.slice(0, 120) });
    revalidateBrand(blocker.brand.slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
