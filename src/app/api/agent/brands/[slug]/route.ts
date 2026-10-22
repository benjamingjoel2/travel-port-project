import type { NextRequest } from "next/server";
import { agentRoute, jsonBody } from "@/lib/agent/http";
import { getBrandForAgent, updateBrandForAgent } from "@/lib/agent/ops";

export const dynamic = "force-dynamic";

/** Brand brief: story, palette, phases, checklist, latest prompt, open comments and blockers. */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/agent/brands/[slug]">) {
  const { slug } = await params;
  return agentRoute(request, (db) => getBrandForAgent(db, slug));
}

/** Fill in text fields such as brandStory, paletteNotes, stagingUrl. */
export async function PATCH(request: NextRequest, { params }: RouteContext<"/api/agent/brands/[slug]">) {
  const { slug } = await params;
  return agentRoute(request, async (db, actor) => updateBrandForAgent(db, actor, slug, await jsonBody(request)));
}
