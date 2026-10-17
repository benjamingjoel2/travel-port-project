"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { initializeBrandChildren } from "@/db/seed";
import { activityLog, brands, pipelineStages, regions, syncItems } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { countryByCode } from "@/lib/countries";
import { syncNow } from "@/lib/sync";
import { regionForCountry } from "@/lib/sync/regions";
import { detectCountryFromName } from "@/lib/sync/detect";
import { parseMarkets } from "@/lib/schemas/brand";

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
import { slugify } from "@/lib/utils";

type Result = { ok: true; message?: string } | { ok: false; error: string };

function revalidateAll() {
  for (const p of ["/", "/brands", "/pipeline", "/settings"]) revalidatePath(p);
}

export async function runSyncNow(): Promise<Result> {
  try {
    await requireRole("editor");
    const s = await syncNow();
    revalidateAll();
    if (s.skipped) return { ok: true, message: "A sync is already running. Refresh in a few seconds." };
    if (!s.ok) return { ok: false, error: s.error ?? "Sync failed." };
    const parts = [
      s.added.length && `added ${s.added.join(", ")}`,
      s.linked.length && `linked ${s.linked.join(", ")}`,
      s.advanced.length && `moved ${s.advanced.length} to Building`,
      s.queued && `${s.queued} to review`,
    ].filter(Boolean);
    return { ok: true, message: parts.length ? `Synced: ${parts.join("; ")}.` : "Synced. Everything is up to date." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sync failed." };
  }
}

export async function setSyncItemStatus(itemId: string, status: "ignored" | "pending"): Promise<Result> {
  try {
    await requireRole("editor");
    const db = await getDb();
    await db.update(syncItems).set({ status }).where(eq(syncItems.id, itemId));
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export type NewBrandFromSync =
  | { brandType: "country"; countryCode: string }
  | { brandType: "region" | "niche"; label: string; markets: string };

export async function addSyncItemAsBrand(itemId: string, input: NewBrandFromSync): Promise<Result> {
  try {
    const actor = await requireRole("editor");
    let countryCode: string | null = null;
    let place: string;
    let markets: string[];
    if (input.brandType === "country") {
      const code = z.string().regex(/^[A-Z]{2}$/, "Pick a country first.").safeParse(input.countryCode);
      if (!code.success) return { ok: false, error: code.error.issues[0]?.message ?? "Pick a country first." };
      countryCode = code.data;
      place = countryByCode(countryCode)?.name ?? countryCode;
      markets = [place];
    } else {
      place = input.label.trim().slice(0, 120);
      markets = parseMarkets(input.markets);
      if (!place) return { ok: false, error: input.brandType === "region" ? "Name the region (e.g. East Africa)." : "Name the niche (e.g. Golf safaris)." };
      if (markets.length === 0) return { ok: false, error: input.brandType === "region" ? "List the countries it covers." : "List the activity." };
    }
    const db = await getDb();
    const item = await db.query.syncItems.findFirst({ where: eq(syncItems.id, itemId) });
    if (!item) return { ok: false, error: "That project is no longer in the list." };
    if (item.brandId) return { ok: false, error: "Already added." };

    const stage = (await db.query.pipelineStages.findFirst({ where: eq(pipelineStages.key, "building") })) ?? (await db.query.pipelineStages.findFirst());
    // Region brands land in the region most of their countries belong to.
    const regionName =
      input.brandType === "country"
        ? regionForCountry(countryCode)
        : input.brandType === "region"
          ? mostCommon(markets.map((m) => regionForCountry(detectCountryFromName(m))).filter((r): r is string => Boolean(r)))
          : null;
    let regionId: string | null = null;
    if (regionName) {
      const existing = await db.query.regions.findFirst({ where: eq(regions.name, regionName) });
      regionId = existing?.id ?? (await db.insert(regions).values({ name: regionName, sortOrder: 1000 }).returning())[0].id;
    }
    let slug = slugify(item.name) || "brand";
    for (let i = 2; await db.query.brands.findFirst({ where: eq(brands.slug, slug), columns: { id: true } }); i++) slug = `${slugify(item.name)}-${i}`;

    const [brand] = await db
      .insert(brands)
      .values({
        name: item.name,
        slug,
        brandType: input.brandType,
        country: place,
        countryCode,
        marketsCovered: markets,
        regionId,
        stageId: stage!.id,
        source: item.kind,
        designReference: "other",
        vercelProjectId: item.kind === "vercel" ? item.key.slice("vercel:".length) : null,
        githubRepo: item.repo,
      })
      .returning();
    await initializeBrandChildren(db, brand.id);
    await db.insert(activityLog).values({ brandId: brand.id, actorId: actor.id, actorName: actor.name, action: "brand_created", details: { name: item.name, source: "review list" } });
    await db.update(syncItems).set({ status: "linked", brandId: brand.id, detectedCountryCode: countryCode }).where(eq(syncItems.id, item.id));
    // Fill links and deploy info straight away.
    await syncNow();
    revalidateAll();
    return { ok: true, message: `${item.name} added.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
