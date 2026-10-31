"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { runMonitor } from "@/lib/monitor";

type Result = { ok: true; message: string } | { ok: false; error: string };

/** "Check now" on the Monitoring page: anyone signed in can run the checks. */
export async function checkSitesNow(): Promise<Result> {
  try {
    await requireActor();
    const last = await runMonitor();
    revalidatePath("/", "layout");
    if (!last) return { ok: false, error: "The check did not finish." };
    return { ok: true, message: last.down ? `Checked ${last.checked} sites: ${last.down} down.` : `Checked ${last.checked} sites: all up.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The check failed." };
  }
}
