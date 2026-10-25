import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isSessionSecretMissing, verifySession } from "@/lib/auth/session-core";

// /api/cron and /api/agent check their own bearer tokens (CRON_SECRET, AGENT_API_TOKEN).
const PUBLIC_PATHS = ["/login", "/robots.txt", "/favicon.ico", "/api/cron", "/api/agent"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // A real database with no password would expose team data to anyone with the link.
  if (isSessionSecretMissing()) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Everyone signs in as themselves; older team-password sessions (no person) must sign in again.
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session?.memberId) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
