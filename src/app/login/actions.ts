"use server";

import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { memberLogins, teamMembers } from "@/db/schema";
import { setSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/auth/password";
import { isPasswordRequired, safeEqual } from "@/lib/auth/session-core";

export type LoginState = { error?: string } | undefined;

const schema = z.object({
  name: z.string().nullish(),
  password: z.string({ error: "Enter your password." }).min(1, "Enter your password."),
  next: z.string().nullish(),
});

/** A team member with a personal login, matched on name (case and spacing ignored). */
async function findLogin(name: string) {
  const clean = name.trim().replace(/\s+/g, " ").toLowerCase();
  if (!clean) return null;
  const db = await getDb();
  const [row] = await db
    .select({ id: teamMembers.id, name: teamMembers.name, active: teamMembers.active, passwordHash: memberLogins.passwordHash })
    .from(teamMembers)
    .innerJoin(memberLogins, eq(memberLogins.memberId, teamMembers.id))
    .where(sql`lower(${teamMembers.name}) = ${clean}`)
    .limit(1);
  return row?.active ? row : null;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (!isPasswordRequired()) redirect("/");
  const parsed = schema.safeParse({ name: formData.get("name"), password: formData.get("password") ?? "", next: formData.get("next") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { name, password } = parsed.data;

  // Tiny delay to blunt brute-force attempts.
  await new Promise((r) => setTimeout(r, 400));
  const personal = name ? await findLogin(name) : null;
  if (personal && (await verifyPassword(password, personal.passwordHash))) {
    // Personal login: signed in as that person straight away.
    await setSession({ memberId: personal.id, memberName: personal.name });
  } else if (safeEqual(password, process.env.DASHBOARD_PASSWORD ?? "")) {
    // Team password: the name picker comes next.
    await setSession({});
  } else {
    return { error: name?.trim() ? "That name and password don't match." : "That password isn't right." };
  }
  const next = parsed.data.next && parsed.data.next.startsWith("/") && !parsed.data.next.startsWith("//") ? parsed.data.next : "/";
  redirect(next);
}
