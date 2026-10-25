import type { NextRequest } from "next/server";
import type { Db } from "@/db";
import type { Actor } from "@/lib/auth";
import { agentRoute, jsonBody } from "@/lib/agent/http";
import {
  AgentError,
  addBlockerForAgent,
  addCommentForAgent,
  addPromptForAgent,
  resolveBlockerForAgent,
  setChecklistForAgent,
  setPhaseForAgent,
  setStageForAgent,
} from "@/lib/agent/ops";

export const dynamic = "force-dynamic";

const ACTIONS: Record<string, (db: Db, actor: Actor, slug: string, body: unknown) => Promise<unknown>> = {
  stage: setStageForAgent,
  phase: setPhaseForAgent,
  checklist: setChecklistForAgent,
  blocker: addBlockerForAgent,
  "resolve-blocker": resolveBlockerForAgent,
  comment: addCommentForAgent,
  prompt: addPromptForAgent,
};

export async function POST(request: NextRequest, { params }: RouteContext<"/api/agent/brands/[slug]/[action]">) {
  const { slug, action } = await params;
  return agentRoute(request, async (db, actor) => {
    const run = ACTIONS[action];
    if (!run) throw new AgentError(`Unknown action "${action}". Use one of: ${Object.keys(ACTIONS).join(", ")}.`, 404);
    return run(db, actor, slug, await jsonBody(request));
  });
}
