"use server";

import { redirect } from "next/navigation";
import { count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { memberLogins, teamMembers } from "@/db/schema";
import { clearSession, setSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/auth/password";
import { ROLES } from "@/lib/constants";

export type WhoAmIState = { error?: string } | undefined;

export async function chooseMember(formData: FormData) {
  const id = String(formData.get("memberId") ?? "");
  const db = await getDb();
  const member = await db.query.teamMembers.findFirst({ where: eq(teamMembers.id, id) });
  if (!member || !member.active) redirect("/whoami?error=unknown");
  // People with their own login must type their password to be picked.
  const login = await db.query.memberLogins.findFirst({ where: eq(memberLogins.memberId, member.id) });
  if (login && !(await verifyPassword(String(formData.get("password") ?? ""), login.passwordHash))) {
    await new Promise((r) => setTimeout(r, 400));
    redirect(`/whoami?error=password&member=${member.id}`);
  }
  await setSession({ memberId: member.id, memberName: member.name });
  redirect("/");
}

const newMemberSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
  email: z.string().trim().email("Enter a valid email.").max(200).optional().or(z.literal("")),
  role: z.enum(ROLES).default("editor"),
});

export async function createAndChooseMember(_prev: WhoAmIState, formData: FormData): Promise<WhoAmIState> {
  const parsed = newMemberSchema.safeParse({ name: formData.get("name") ?? "", email: formData.get("email") ?? "", role: formData.get("role") ?? "editor" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const db = await getDb();
  const sameName = await db.query.teamMembers.findFirst({ where: sql`lower(${teamMembers.name}) = ${parsed.data.name.toLowerCase()}`, columns: { id: true } });
  if (sameName) return { error: "Someone with that name already exists. Pick them from the list instead." };
  const [{ value: existing }] = await db.select({ value: count() }).from(teamMembers);
  // The very first person becomes the owner so somebody can manage settings.
  const role = existing === 0 ? "owner" : parsed.data.role;
  try {
    const [member] = await db
      .insert(teamMembers)
      .values({ name: parsed.data.name, email: parsed.data.email || null, role })
      .returning();
    await setSession({ memberId: member.id, memberName: member.name });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unique|duplicate/i.test(msg)) return { error: "Someone with that email already exists. Pick them from the list instead." };
    throw e;
  }
  redirect("/");
}

export async function signOut() {
  await clearSession();
  redirect("/login");
}
