// Edge-safe (no Node imports): used by proxy.ts as well as server code.

/**
 * Postgres connection string. Vercel's Neon integration sets DATABASE_URL by default,
 * but older or custom-prefixed connections use POSTGRES_URL.
 */
export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

/**
 * Direct (non-pooled) connection for migrations. Session-level advisory locks don't work
 * reliably through a transaction-mode pooler such as Neon's, so setup uses this when available.
 */
export function directDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || databaseUrl();
}
