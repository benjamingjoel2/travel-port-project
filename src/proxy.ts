import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isPasswordMissing, isPasswordRequired, verifySession } from "@/lib/auth/session-core";

// /api/cron checks its own CRON_SECRET bearer token.
const PUBLIC_PATHS = ["/login", "/robots.txt", "/favicon.ico", "/api/cron"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // A real database with no password would expose team data to anyone with the link.
  if (isPasswordMissing()) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!isPasswordRequired()) {
    // Demo / local mode: nothing to protect.
    return NextResponse.next();
  }

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
