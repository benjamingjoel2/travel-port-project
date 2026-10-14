"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { teamMembers } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import type { ActionResult } from "@/lib/actions/brands";

const memberSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
  email: z.string().trim().email("Enter a valid email.").max(200).or(z.literal("")),
  role: z.enum(ROLES),
});

export type MemberFormState = { error?: string; ok?: boolean } | undefined;

export async function addMember(_prev: MemberFormState, formData: FormData): Promise<MemberFormState> {
  try {
    await requireRole("owner");
    const parsed = memberSchema.safeParse({ name: formData.get("name"), email: formData.get("email") ?? "", role: formData.get("role") ?? "editor" });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message };
    const db = await getDb();
    await db.insert(teamMembers).values({ name: parsed.data.name, email: parsed.data.email || null, role: parsed.data.role });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Something went wrong.";
    return { error: /unique|duplicate/i.test(msg) ? "A member with that email already exists." : msg };
  }
}

export async function updateMember(id: string, patch: { role?: (typeof ROLES)[number]; active?: boolean }): Promise<ActionResult> {
  try {
    const actor = await requireRole("owner");
    const db = await getDb();
    if (id === actor.id && (patch.role !== undefined && patch.role !== "owner" || patch.active === false)) {
      return { ok: false, error: "You can't demote or deactivate yourself." };
    }
    await db.update(teamMembers).set({ ...patch, updatedAt: new Date() }).where(eq(teamMembers.id, id));
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
