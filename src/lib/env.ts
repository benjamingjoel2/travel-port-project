// Edge-safe (no Node imports): used by proxy.ts as well as server code.

/**
 * Postgres connection string. Vercel's Neon integration sets DATABASE_URL by default,
 * but older or custom-prefixed connections use POSTGRES_URL.
 */
export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}
