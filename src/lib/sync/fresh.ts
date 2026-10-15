import "server-only";
import { cache } from "react";
import { after, connection } from "next/server";
import { maybeSync } from "./index";

/** How long a page waits for a sync before rendering anyway (the sync then finishes in the background). */
const WAIT_MS = 5000;

/**
 * Make sure what a page is about to show includes the latest Vercel and GitHub
 * projects. Runs a sync first when the last one is over a minute old, so opening the
 * dashboard always shows new projects. Deduplicated per request by React's cache().
 */
export const ensureFreshData = cache(async (): Promise<void> => {
  // Marks the page as per-request; during a build's prerender this stops here, so no
  // sync ever runs (or records an attempt) at build time.
  await connection();
  const run = maybeSync().catch((e) => console.error("[auto-sync] failed", e));
  const finished = await Promise.race([run.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), WAIT_MS))]);
  if (!finished) after(() => run);
});
