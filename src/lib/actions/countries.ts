"use server";

import { revalidatePath } from "next/cache";
import { eq, max } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { plannedCountries, plannedStatusEnum } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { countryByCode } from "@/lib/countries";
import type { ActionResult } from "./brands";

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
}

const updateSchema = z.object({
  status: z.enum(plannedStatusEnum.enumValues).optional(),
  wave: z.coerce.number().int().min(1).max(9).optional(),
  note: z.string().trim().max(300).optional(),
});

export async function updatePlannedCountry(id: string, patch: z.input<typeof updateSchema>): Promise<ActionResult> {
  try {
    await requireRole("editor");
    const parsed = updateSchema.safeParse(patch);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid change." };
    const db = await getDb();
    await db.update(plannedCountries).set({ ...parsed.data, note: parsed.data.note === "" ? null : parsed.data.note, updatedAt: new Date() }).where(eq(plannedCountries.id, id));
    revalidatePath("/countries");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const addSchema = z.object({
  countryCode: z.string().regex(/^[A-Z]{2}$/, "Pick a country."),
  wave: z.coerce.number().int().min(1).max(9).default(1),
  note: z.string().trim().max(300).optional().default(""),
});

export async function addPlannedCountry(input: z.input<typeof addSchema>): Promise<ActionResult> {
  try {
    await requireRole("editor");
    const parsed = addSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid country." };
    if (!countryByCode(parsed.data.countryCode)) return { ok: false, error: "Pick a country." };
    const db = await getDb();
    const existing = await db.query.plannedCountries.findFirst({ where: eq(plannedCountries.countryCode, parsed.data.countryCode) });
    if (existing) return { ok: false, error: `${countryByCode(parsed.data.countryCode)?.name} is already on the plan.` };
    const [{ value: last }] = await db.select({ value: max(plannedCountries.sortOrder) }).from(plannedCountries);
    await db.insert(plannedCountries).values({ countryCode: parsed.data.countryCode, wave: parsed.data.wave, note: parsed.data.note || null, sortOrder: (last ?? 0) + 1 });
    revalidatePath("/countries");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removePlannedCountry(id: string): Promise<ActionResult> {
  try {
    await requireRole("editor");
    const db = await getDb();
    await db.delete(plannedCountries).where(eq(plannedCountries.id, id));
    revalidatePath("/countries");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
