"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { teamMembers } from "@/db/schema";
import { getActor } from "@/lib/auth";

/** Everything up to now counts as read for the signed-in person. */
export async function markNotificationsSeen(): Promise<void> {
  const actor = await getActor();
  if (!actor) return;
  const db = await getDb();
  await db.update(teamMembers).set({ notificationsSeenAt: new Date() }).where(eq(teamMembers.id, actor.id));
}
