import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { teamMembers, type MemberRole, type TeamMember } from "@/db/schema";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession, type SessionPayload } from "./session-core";

export { isPasswordRequired, isPasswordMissing } from "./session-core";

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export async function setSession(payload: SessionPayload) {
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export type Actor = Pick<TeamMember, "id" | "name" | "role">;

/** The team member using the app right now, or null if they haven't picked a name yet. */
export async function getActor(): Promise<Actor | null> {
  const session = await getSession();
  if (!session?.memberId) return null;
  const db = await getDb();
  const member = await db.query.teamMembers.findFirst({ where: eq(teamMembers.id, session.memberId) });
  if (!member || !member.active) return null;
  return { id: member.id, name: member.name, role: member.role };
}

/** Pages: send people to the name picker if they haven't chosen who they are. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/whoami");
  return actor;
}

const RANK: Record<MemberRole, number> = { viewer: 0, editor: 1, owner: 2 };

export function canEdit(role: MemberRole) {
  return RANK[role] >= RANK.editor;
}

/** Server actions: throw unless the current member has at least this role. */
export async function requireRole(role: MemberRole): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new Error("Please choose who you are first.");
  if (RANK[actor.role] < RANK[role]) throw new Error(`This needs the ${role} role. You are a ${actor.role}.`);
  return actor;
}
