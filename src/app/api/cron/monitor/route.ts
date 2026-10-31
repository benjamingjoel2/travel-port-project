import { NextResponse, type NextRequest } from "next/server";
import { maybeMonitor, runMonitor } from "@/lib/monitor";
import { safeEqual } from "@/lib/auth/session-core";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Runs the site checks. With the CRON_SECRET (Vercel Cron) it checks right away; without it
 * (the GitHub Actions schedule, which holds no secret) it only checks when the last run is over
 * eight minutes old, so calling it can never do more than the schedule already does. It returns
 * counts only, never site details.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (secret && safeEqual(auth, `Bearer ${secret}`)) {
    const last = await runMonitor();
    return NextResponse.json({ ran: true, checked: last?.checked ?? 0, down: last?.down ?? 0 });
  }
  return NextResponse.json({ ran: await maybeMonitor() });
}
