import type { NextRequest } from "next/server";
import { agentRoute, jsonBody } from "@/lib/agent/http";
import { createBrandForAgent, listBrandsBrief } from "@/lib/agent/ops";

export const dynamic = "force-dynamic";

/** Every brand with its stage and progress, plus the pipeline stages. */
export async function GET(request: NextRequest) {
  return agentRoute(request, (db) => listBrandsBrief(db));
}

/** Register a new brand (defaults to the Named stage). */
export async function POST(request: NextRequest) {
  return agentRoute(request, async (db, actor) => createBrandForAgent(db, actor, await jsonBody(request)));
}
