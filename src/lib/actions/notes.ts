"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { brands, notes } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import type { ActionResult } from "./brands";
import { logActivity } from "./activity";

export async function addNote(brandId: string, body: string): Promise<ActionResult> {
  try {
    const actor = await requireRole("editor");
    const parsed = z.string().trim().min(1, "Write something first.").max(10000).safeParse(body);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid note." };
    const db = await getDb();
    const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId), columns: { slug: true } });
    if (!brand) return { ok: false, error: "Brand not found." };
    await db.insert(notes).values({ brandId, authorId: actor.id, body: parsed.data });
    await db.update(brands).set({ updatedAt: new Date() }).where(eq(brands.id, brandId));
    await logActivity(db, brandId, actor, "note_added", { preview: parsed.data.slice(0, 80) });
    revalidatePath(`/brands/${brand.slug}`);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function deleteNote(noteId: string): Promise<ActionResult> {
  try {
    const actor = await requireRole("editor");
    const db = await getDb();
    const note = await db.query.notes.findFirst({ where: eq(notes.id, noteId), with: { brand: { columns: { slug: true } } } });
    if (!note) return { ok: false, error: "Note not found." };
    if (note.authorId !== actor.id && actor.role !== "owner") return { ok: false, error: "Only the author or an owner can delete this note." };
    await db.delete(notes).where(eq(notes.id, noteId));
    revalidatePath(`/brands/${note.brand.slug}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
