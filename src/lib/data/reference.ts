import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pipelineStages, regions, teamMembers } from "@/db/schema";

export async function getStages() {
  const db = await getDb();
  return db.query.pipelineStages.findMany({ orderBy: [asc(pipelineStages.sortOrder)] });
}

export async function getRegions() {
  const db = await getDb();
  return db.query.regions.findMany({ orderBy: [asc(regions.sortOrder)] });
}

export async function getMembers(activeOnly = true) {
  const db = await getDb();
  return db.query.teamMembers.findMany({
    where: activeOnly ? eq(teamMembers.active, true) : undefined,
    orderBy: [asc(teamMembers.name)],
  });
}

/** Everything the brand form needs for its dropdowns. */
export async function getReferenceData() {
  const [stages, regionRows, members] = await Promise.all([getStages(), getRegions(), getMembers()]);
  return { stages, regions: regionRows, members };
}
