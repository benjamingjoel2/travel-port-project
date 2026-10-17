import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { seedDatabase, initializeBrandChildren } from "@/db/seed";
import { applyDataPatches } from "@/db/patches";
import { verifyPassword } from "@/lib/auth/password";
import type { Db } from "@/db";
import { runSync } from "@/lib/sync/engine";

let db: Db;
beforeAll(async () => {
  db = drizzle(new PGlite(), { schema }) as unknown as Db;
  await migrate(db as never, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await seedDatabase(db);
});

describe("brand type", () => {
  it("existing brands are country brands whose market is their own country", async () => {
    const nusa = await db.query.brands.findFirst({ where: eq(schema.brands.name, "Nusa & Co.") });
    expect(nusa?.brandType).toBe("country");
    expect(nusa?.marketsCovered).toEqual(["Indonesia"]);
  });

  it("turns an auto-added Aravia into a region brand, once, and sync leaves it alone", async () => {
    const stage = await db.query.pipelineStages.findFirst({ where: eq(schema.pipelineStages.key, "building") });
    const [aravia] = await db
      .insert(schema.brands)
      .values({ name: "Aravia", slug: "aravia", country: "United Arab Emirates", countryCode: "AE", marketsCovered: ["United Arab Emirates"], stageId: stage!.id, source: "github", githubRepo: "benjamingjoel2/aravia" })
      .returning();
    await initializeBrandChildren(db, aravia.id);

    await applyDataPatches(db);
    let b = await db.query.brands.findFirst({ where: eq(schema.brands.id, aravia.id), with: { region: true } });
    expect(b?.brandType).toBe("region");
    expect(b?.country).toBe("Arab world");
    expect(b?.countryCode).toBeNull();
    expect(b?.marketsCovered).toEqual(["United Arab Emirates", "Saudi Arabia", "Oman", "Qatar", "Jordan", "Bahrain", "Egypt"]);
    expect(b?.region?.name).toBe("North Africa & Middle East");

    // A later manual edit is not undone by the patch running again.
    await db.update(schema.brands).set({ marketsCovered: ["Oman"] }).where(eq(schema.brands.id, aravia.id));
    await applyDataPatches(db);

    await runSync(db, { vercelToken: "t", githubOwner: "benjamingjoel2", selfRepo: "benjamingjoel2/travel-port-project" }, {
      listVercelProjects: async () => ({ projects: [] }),
      listGithubRepos: async () =>
        ["aravia", "extrafari"].map((name) => ({ fullName: `benjamingjoel2/${name}`, name, htmlUrl: `https://github.com/benjamingjoel2/${name}`, pushedAt: "2026-10-16T10:00:00Z", private: false })),
      fetchRepoDocs: async (repo) => (repo.endsWith("aravia") ? "Luxury travel across the UAE, Saudi Arabia and Oman." : "Private safaris across Kenya, Tanzania, Uganda and Rwanda."),
    });
    b = await db.query.brands.findFirst({ where: eq(schema.brands.id, aravia.id), with: { region: true } });
    expect(b?.brandType).toBe("region");
    expect(b?.countryCode).toBeNull();
    expect(b?.marketsCovered).toEqual(["Oman"]);
    expect(await db.query.brands.findMany({ where: eq(schema.brands.name, "Aravia") })).toHaveLength(1);
  });

  it("adds Extrafari as an East & Southern Africa region brand even before auto-sync has seen it", async () => {
    const all = await db.query.brands.findMany({ where: eq(schema.brands.githubRepo, "benjamingjoel2/extrafari"), with: { region: true } });
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Extrafari");
    expect(all[0].brandType).toBe("region");
    expect(all[0].country).toBe("East & Southern Africa");
    expect(all[0].countryCode).toBeNull();
    expect(all[0].marketsCovered).toEqual(["Kenya", "Tanzania", "Uganda", "Rwanda", "South Africa", "Namibia", "Botswana", "Zambia"]);
    expect(all[0].region?.name).toBe("East Africa");
  });

  it("gives Sevo Widodo a personal login", async () => {
    const sevo = await db.query.teamMembers.findFirst({ where: eq(schema.teamMembers.name, "Sevo Widodo") });
    expect(sevo?.active).toBe(true);
    expect(sevo?.role).toBe("owner");
    const login = await db.query.memberLogins.findFirst({ where: eq(schema.memberLogins.memberId, sevo!.id) });
    expect(await verifyPassword("1234567890", login!.passwordHash)).toBe(true);
    // The member row itself never carries the hash.
    expect(Object.keys(sevo!)).not.toContain("passwordHash");
  });

  it("gives Benjamin an owner login, so exactly two people can sign in", async () => {
    const ben = await db.query.teamMembers.findFirst({ where: eq(schema.teamMembers.name, "Benjamin") });
    expect(ben?.role).toBe("owner");
    const login = await db.query.memberLogins.findFirst({ where: eq(schema.memberLogins.memberId, ben!.id) });
    expect(await verifyPassword("ProjectBali27!", login!.passwordHash)).toBe(true);
    expect(await verifyPassword("1234567890", login!.passwordHash)).toBe(false);
    expect(await db.query.memberLogins.findMany()).toHaveLength(2);
  });
});

