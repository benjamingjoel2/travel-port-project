import "server-only";
import { desc, eq, isNull, and } from "drizzle-orm";
import { getDb } from "@/db";
import { blockers, brands, type Brand, type BrandChecklistItem, type BuildPhase, type PipelineStage, type Region, type TeamMember, type Blocker } from "@/db/schema";

export type BrandSummary = Brand & {
  stage: PipelineStage;
  region: Region | null;
  owner: TeamMember | null;
  phasesDone: number;
  phasesTotal: number;
  checklistDone: number;
  checklistTotal: number;
  checklistRequiredMissing: number;
  missingRequiredLabels: string[];
  openBlockers: number;
};

function summarize(b: Brand & { stage: PipelineStage; region: Region | null; owner: TeamMember | null; phases: BuildPhase[]; checklist: BrandChecklistItem[]; blockers: Blocker[] }): BrandSummary {
  const { phases, checklist, blockers: blockerRows, ...rest } = b;
  return {
    ...rest,
    phasesDone: phases.filter((p) => p.status === "done").length,
    phasesTotal: phases.length,
    checklistDone: checklist.filter((c) => c.done).length,
    checklistTotal: checklist.length,
    checklistRequiredMissing: checklist.filter((c) => c.required && !c.done).length,
    missingRequiredLabels: checklist
      .filter((c) => c.required && !c.done)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => c.label),
    openBlockers: blockerRows.filter((x) => !x.resolvedAt).length,
  };
}

export type BrandSort = "name" | "country" | "region" | "stage" | "phases" | "checklist" | "owner" | "priority" | "target" | "updated";

export type BrandFilters = {
  q?: string;
  stage?: string; // stage key
  region?: string; // region id
  owner?: string; // member id
  priority?: string;
  sort?: BrandSort;
  dir?: "asc" | "desc";
};

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

export async function listBrands(filters: BrandFilters = {}): Promise<BrandSummary[]> {
  const db = await getDb();
  const rows = await db.query.brands.findMany({
    with: { stage: true, region: true, owner: true, phases: true, checklist: true, blockers: true },
    orderBy: [desc(brands.updatedAt)],
  });
  let list = rows.map(summarize);

  if (filters.q) {
    const q = filters.q.trim().toLowerCase();
    list = list.filter((b) => b.name.toLowerCase().includes(q) || b.country.toLowerCase().includes(q) || b.slug.includes(q));
  }
  if (filters.stage) list = list.filter((b) => b.stage.key === filters.stage);
  if (filters.region) list = list.filter((b) => b.regionId === filters.region);
  if (filters.owner) list = list.filter((b) => (filters.owner === "none" ? !b.ownerId : b.ownerId === filters.owner));
  if (filters.priority) list = list.filter((b) => b.priority === filters.priority);

  const dir = filters.dir === "desc" ? -1 : 1;
  const sort = filters.sort ?? "updated";
  const cmpStr = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").localeCompare(b ?? "");
  list.sort((a, b) => {
    switch (sort) {
      case "name":
        return dir * cmpStr(a.name, b.name);
      case "country":
        return dir * cmpStr(a.country, b.country);
      case "region":
        return dir * cmpStr(a.region?.name, b.region?.name);
      case "stage":
        return dir * (a.stage.sortOrder - b.stage.sortOrder);
      case "phases":
        return dir * (a.phasesDone - b.phasesDone);
      case "checklist":
        return dir * (a.checklistDone - b.checklistDone);
      case "owner":
        return dir * cmpStr(a.owner?.name, b.owner?.name);
      case "priority":
        return dir * (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
      case "target":
        return dir * cmpStr(a.targetLaunchDate, b.targetLaunchDate);
      case "updated":
      default:
        return -dir * (a.updatedAt.getTime() - b.updatedAt.getTime());
    }
  });
  return list;
}

export async function getBrandBySlug(slug: string) {
  const db = await getDb();
  return db.query.brands.findFirst({
    where: eq(brands.slug, slug),
    with: {
      stage: true,
      region: true,
      owner: true,
      phases: { orderBy: (p, { asc }) => [asc(p.phaseNumber)] },
      checklist: { orderBy: (c, { asc }) => [asc(c.sortOrder)] },
      prompts: { orderBy: (p, { desc }) => [desc(p.version)] },
      notes: { with: { author: true }, orderBy: (n, { desc }) => [desc(n.createdAt)] },
      blockers: { orderBy: (b, { desc }) => [desc(b.openedAt)] },
      activity: { orderBy: (a, { desc }) => [desc(a.createdAt)], limit: 50 },
    },
  });
}

export type BrandDetail = NonNullable<Awaited<ReturnType<typeof getBrandBySlug>>>;

/** Required checklist items that still block a move into a checklist-gated stage. */
export async function getMissingChecklistItems(brandId: string) {
  const db = await getDb();
  const items = await db.query.brandChecklistItems.findMany({
    where: (c, { and, eq }) => and(eq(c.brandId, brandId), eq(c.required, true), eq(c.done, false)),
    orderBy: (c, { asc }) => [asc(c.sortOrder)],
  });
  return items;
}

export async function getOpenBlockers() {
  const db = await getDb();
  return db.query.blockers.findMany({
    where: and(isNull(blockers.resolvedAt)),
    with: { brand: { columns: { id: true, name: true, slug: true, country: true } } },
    orderBy: (b, { asc }) => [asc(b.openedAt)],
  });
}
