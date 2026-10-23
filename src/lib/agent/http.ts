import "server-only";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getDb, type Db } from "@/db";
import type { Actor } from "@/lib/auth";
import { safeEqual } from "@/lib/auth/session-core";
import { AgentError, getAgentActor } from "./ops";

/**
 * Wraps an /api/agent handler: checks the AGENT_API_TOKEN bearer token, acts as the
 * agent team member, turns validation errors into 4xx JSON and refreshes cached pages
 * after writes. The proxy lets /api/agent through, so this check is the only gate.
 */
export async function agentRoute(request: NextRequest, run: (db: Db, actor: Actor) => Promise<unknown>) {
  const token = process.env.AGENT_API_TOKEN;
  if (!token) return NextResponse.json({ error: "The agent API is off. Set AGENT_API_TOKEN in the Vercel project to turn it on." }, { status: 503 });
  if (!safeEqual(request.headers.get("authorization") ?? "", `Bearer ${token}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const db = await getDb();
    const actor = await getAgentActor(db, process.env.AGENT_NAME || undefined);
    const result = await run(db, actor);
    if (request.method !== "GET") revalidatePath("/", "layout");
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") }, { status: 400 });
    }
    if (e instanceof AgentError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("agent api", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

/** Request body as JSON, or {} when there is none. */
export async function jsonBody(request: NextRequest): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AgentError("Body must be JSON.");
  }
}
