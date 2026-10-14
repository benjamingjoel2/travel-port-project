import "server-only";
import type { Db } from "@/db";
import { activityLog } from "@/db/schema";
import type { Actor } from "@/lib/auth";

export async function logActivity(db: Db, brandId: string, actor: Actor | null, action: string, details?: Record<string, unknown>) {
  await db.insert(activityLog).values({
    brandId,
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? null,
    action,
    details: details ?? null,
  });
}
