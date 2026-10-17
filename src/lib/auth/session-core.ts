// Edge- and Node-safe session helpers (no next/headers, no node: imports) so proxy.ts can use them.
import { SignJWT, jwtVerify } from "jose";
import { databaseUrl } from "@/lib/env";

export const SESSION_COOKIE = "tp_session";
export const SESSION_DAYS = 30;

export type SessionPayload = {
  memberId?: string;
  memberName?: string;
};

/** A real database is attached but there is no secret to sign sessions with: refuse to serve data. */
export function isSessionSecretMissing(): boolean {
  return Boolean(databaseUrl()) && !process.env.SESSION_SECRET && !process.env.DASHBOARD_PASSWORD;
}

function secret(): Uint8Array {
  const raw = process.env.SESSION_SECRET || (process.env.DASHBOARD_PASSWORD ? `build-tracker::${process.env.DASHBOARD_PASSWORD}` : "build-tracker::open-mode");
  return new TextEncoder().encode(raw);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return {
      memberId: typeof payload.memberId === "string" ? payload.memberId : undefined,
      memberName: typeof payload.memberName === "string" ? payload.memberName : undefined,
    };
  } catch {
    return null;
  }
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}
