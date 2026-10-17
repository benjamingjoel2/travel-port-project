import "server-only";
import path from "node:path";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { databaseUrl, directDatabaseUrl } from "@/lib/env";
import { seedDatabase } from "./seed";
import { applyDataPatches } from "./patches";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

export type DbMode = "postgres" | "demo" | "local";

type Holder = { db: Db; mode: DbMode; ready: Promise<void> };

declare global {
  // Cached across hot reloads in dev and across requests in one serverless instance.
  var __buildTrackerDb: Holder | undefined;
}

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/** Where the data lives right now. Used for the demo-mode banner and setup hints. */
export function getDbMode(): DbMode {
  if (databaseUrl()) return "postgres";
  return process.env.VERCEL ? "demo" : "local";
}

async function createHolder(): Promise<Holder> {
  const mode = getDbMode();

  if (mode === "postgres") {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const url = databaseUrl()!;
    const ssl = /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false };
    const pool = new Pool({ connectionString: url, max: 5, ssl });
    const db = drizzle(pool, { schema }) as unknown as Db;

    const ready = (async () => {
      // Migrations use a direct connection: one session holds an advisory lock so several
      // cold-starting instances can't run them at once (pooled connections can't hold it).
      const { Client } = await import("pg");
      const directUrl = directDatabaseUrl()!;
      const client = new Client({ connectionString: directUrl, ssl: /localhost|127\.0\.0\.1/.test(directUrl) ? undefined : { rejectUnauthorized: false } });
      await client.connect();
      try {
        await client.query("select pg_advisory_lock(727101)");
        const migrator = drizzle(client, { schema });
        await migrate(migrator, { migrationsFolder: MIGRATIONS_FOLDER });
        await seedDatabase(migrator as unknown as Db);
        await applyDataPatches(migrator as unknown as Db);
      } finally {
        await client.query("select pg_advisory_unlock(727101)").catch(() => {});
        await client.end().catch(() => {});
      }
    })();

    return { db, mode, ready };
  }

  // No DATABASE_URL: run an embedded Postgres (PGlite). On Vercel that's an
  // in-memory demo; locally it persists to ./.pglite so dev data survives restarts.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = mode === "local" ? new PGlite(path.join(process.cwd(), ".pglite")) : new PGlite();
  const db = drizzle(client, { schema }) as unknown as Db;
  const ready = (async () => {
    await migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
    await seedDatabase(db);
    await applyDataPatches(db);
  })();
  return { db, mode, ready };
}

let creating: Promise<Holder> | undefined;

/** The shared database handle. Migrations and seed data are applied on first use. */
export async function getDb(): Promise<Db> {
  if (!globalThis.__buildTrackerDb) {
    creating ??= createHolder().then((h) => {
      globalThis.__buildTrackerDb = h;
      return h;
    });
    await creating;
  }
  const holder = globalThis.__buildTrackerDb!;
  await holder.ready;
  return holder.db;
}
