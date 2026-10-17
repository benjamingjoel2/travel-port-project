"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { brands, notes } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import type { ActionResult } from "./brands";
import { logActivity } from "./activity";

const bodySchema = z.string().trim().min(1, "Write something first.").max(10000);

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
}

function refresh(slug: string) {
  revalidatePath(`/brands/${slug}`);
  revalidatePath("/");
  revalidatePath("/brands");
  revalidatePath("/pipeline");
}

async function findNote(noteId: string) {
  const db = await getDb();
  const note = await db.query.notes.findFirst({ where: eq(notes.id, noteId), with: { brand: { columns: { slug: true } } } });
  return { db, note };
}

export async function addNote(brandId: string, body: string): Promise<ActionResult> {
  try {
    const actor = await requireRole("editor");
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid comment." };
    const db = await getDb();
    const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId), columns: { slug: true } });
    if (!brand) return { ok: false, error: "Brand not found." };
    await db.insert(notes).values({ brandId, authorId: actor.id, body: parsed.data });
    await db.update(brands).set({ updatedAt: new Date() }).where(eq(brands.id, brandId));
    await logActivity(db, brandId, actor, "note_added", { preview: parsed.data.slice(0, 80) });
    refresh(brand.slug);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateNote(noteId: string, body: string): Promise<ActionResult> {
  try {
    const actor = await requireRole("editor");
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid comment." };
    const { db, note } = await findNote(noteId);
    if (!note) return { ok: false, error: "Comment not found." };
    if (note.authorId !== actor.id && actor.role !== "owner") return { ok: false, error: "Only the author or an owner can edit this comment." };
    if (note.body === parsed.data) return { ok: true };
    await db.update(notes).set({ body: parsed.data, editedAt: new Date(), updatedAt: new Date() }).where(eq(notes.id, noteId));
    await logActivity(db, note.brandId, actor, "note_edited", { preview: parsed.data.slice(0, 80) });
    refresh(note.brand.slug);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Anyone who can edit can mark a comment done (handled) or reopen it. */
export async function setNoteDone(noteId: string, done: boolean): Promise<ActionResult> {
  try {
    const actor = await requireRole("editor");
    const { db, note } = await findNote(noteId);
    if (!note) return { ok: false, error: "Comment not found." };
    await db
      .update(notes)
      .set(done ? { doneAt: new Date(), doneById: actor.id, updatedAt: new Date() } : { doneAt: null, doneById: null, updatedAt: new Date() })
      .where(eq(notes.id, noteId));
    await logActivity(db, note.brandId, actor, done ? "note_done" : "note_reopened", { preview: note.body.slice(0, 80) });
    refresh(note.brand.slug);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteNote(noteId: string): Promise<ActionResult> {
  try {
    const actor = await requireRole("editor");
    const { db, note } = await findNote(noteId);
    if (!note) return { ok: false, error: "Comment not found." };
    if (note.authorId !== actor.id && actor.role !== "owner") return { ok: false, error: "Only the author or an owner can delete this comment." };
    await db.delete(notes).where(eq(notes.id, noteId));
    refresh(note.brand.slug);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
