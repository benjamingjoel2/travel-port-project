import "server-only";
import { and, count, desc, eq, gt, inArray, isNull, ne, or } from "drizzle-orm";
import { getDb } from "@/db";
import { activityLog, teamMembers } from "@/db/schema";
import type { Actor } from "@/lib/auth";

/** Activity worth a ping. Your own actions never notify you; auto-sync's (no person) always do. */
export const NOTIFY_ACTIONS = ["note_added", "note_replied", "note_edited", "note_done", "note_reopened", "blocker_opened", "blocker_resolved", "blocker_reopened", "status_changed", "brand_created", "site_down", "site_up", "build_failed", "build_fixed"];

export async function getNotifications(actor: Actor, limit = 30) {
  const db = await getDb();
  const me = await db.query.teamMembers.findFirst({ where: eq(teamMembers.id, actor.id), columns: { notificationsSeenAt: true, createdAt: true } });
  const seenAt = me?.notificationsSeenAt ?? me?.createdAt ?? new Date(0);
  const forMe = and(inArray(activityLog.action, NOTIFY_ACTIONS), or(isNull(activityLog.actorId), ne(activityLog.actorId, actor.id)));
  const [items, [{ value: unread }]] = await Promise.all([
    db.query.activityLog.findMany({
      where: forMe,
      with: { brand: { columns: { name: true, slug: true } } },
      orderBy: [desc(activityLog.createdAt)],
      limit,
    }),
    db.select({ value: count() }).from(activityLog).where(and(forMe, gt(activityLog.createdAt, seenAt))),
  ]);
  return { items, unread: Number(unread), seenAt };
}

export type NotificationData = Awaited<ReturnType<typeof getNotifications>>;
