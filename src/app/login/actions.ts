"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { memberLogins, teamMembers } from "@/db/schema";
import { clearSession, setSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/auth/password";

export type LoginState = { error?: string } | undefined;

const schema = z.object({
  memberId: z.string({ error: "Choose who you are." }).uuid("Choose who you are."),
  password: z.string({ error: "Enter your password." }).min(1, "Enter your password."),
  next: z.string().nullish(),
});

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ memberId: formData.get("memberId") ?? "", password: formData.get("password") ?? "", next: formData.get("next") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  // Tiny delay to blunt brute-force attempts.
  await new Promise((r) => setTimeout(r, 400));
  const db = await getDb();
  const [person] = await db
    .select({ id: teamMembers.id, name: teamMembers.name, active: teamMembers.active, passwordHash: memberLogins.passwordHash })
    .from(teamMembers)
    .innerJoin(memberLogins, eq(memberLogins.memberId, teamMembers.id))
    .where(eq(teamMembers.id, parsed.data.memberId))
    .limit(1);
  if (!person?.active || !(await verifyPassword(parsed.data.password, person.passwordHash))) {
    return { error: "That password isn't right." };
  }
  await setSession({ memberId: person.id, memberName: person.name });
  const next = parsed.data.next && parsed.data.next.startsWith("/") && !parsed.data.next.startsWith("//") ? parsed.data.next : "/";
  redirect(next);
}

export async function signOut() {
  await clearSession();
  redirect("/login");
}
