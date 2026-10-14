import { NextResponse, type NextRequest } from "next/server";
import { isSyncConfigured, syncNow } from "@/lib/sync";
import { safeEqual } from "@/lib/auth/session-core";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Called daily by Vercel Cron (see vercel.json) as a backstop to the on-visit sync. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isSyncConfigured()) return NextResponse.json({ skipped: "sync not configured" });
  const summary = await syncNow();
  return NextResponse.json({ ok: summary.ok, added: summary.added, linked: summary.linked, advanced: summary.advanced, queued: summary.queued, error: summary.error });
}
