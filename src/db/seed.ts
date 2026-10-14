import { count, eq } from "drizzle-orm";
import type { Db } from "./index";
import * as schema from "./schema";
import { BUILD_PHASES, DEFAULT_CHECKLIST, DEFAULT_REGIONS, DEFAULT_STAGES } from "@/lib/constants";
import { slugify } from "@/lib/utils";

const SEED_BRANDS: {
  name: string;
  country: string;
  countryCode: string;
  region: string;
  designReference: "atlas" | "vita" | "other";
  designReferenceUrl?: string;
  contentReferenceUrls?: string[];
  paletteNotes?: string;
}[] = [
  {
    name: "Nusa & Co.",
    country: "Indonesia",
    countryCode: "ID",
    region: "Asia",
    designReference: "atlas",
    designReferenceUrl: "https://www.safari.com",
    contentReferenceUrls: ["https://mooremisadventures.com (best-of-Indonesia article)"],
  },
  {
    name: "Cenote House",
    country: "Mexico",
    countryCode: "MX",
    region: "Latin America",
    designReference: "atlas",
    designReferenceUrl: "https://www.safari.com",
    contentReferenceUrls: ["https://mooremisadventures.com (article, blog format)"],
  },
  {
    name: "Antigua & Beyond",
    country: "Guatemala",
    countryCode: "GT",
    region: "Latin America",
    designReference: "vita",
    designReferenceUrl: "https://vita-travel.webflow.io",
  },
  {
    name: "Safari Njema",
    country: "Kenya",
    countryCode: "KE",
    region: "East Africa",
    designReference: "vita",
    designReferenceUrl: "https://vita-travel.webflow.io",
  },
  {
    name: "Uhuru Journeys",
    country: "Tanzania",
    countryCode: "TZ",
    region: "East Africa",
    designReference: "vita",
    designReferenceUrl: "https://vita-travel.webflow.io",
  },
];

const PLACEHOLDER_TEMPLATE = (style: string, reference: string) => `You are building a premium travel brand website for {{brand_name}}, a specialist in {{country}}.

Design reference: ${style} (${reference}). Match its structure and feel, not its content.
Reference URLs: {{reference_urls}}

Brand story:
{{brand_story}}

Palette: {{palette}}
Currencies: {{currencies}}
Destinations: {{destinations}}
Signature experiences: {{experiences}}
Trip planner routes: {{planner_routes}}
FAQ topics: {{faq_topics}}

Build in five phases and stop for review after each:
1. Layout, header, footer, design tokens
2. Homepage
3. Trip planner
4. Detail pages and blog
5. Polish, accessibility, SEO, Lighthouse

(Placeholder template. Replace this body with the real ${style} prompt in Settings or the Prompts page.)`;

/** Create the per-brand phase and checklist rows every brand needs. */
export async function initializeBrandChildren(db: Db, brandId: string) {
  await db.insert(schema.buildPhases).values(BUILD_PHASES.map((p) => ({ brandId, phaseNumber: p.number, name: p.name })));
  const template = await db.query.checklistTemplateItems.findMany({
    where: eq(schema.checklistTemplateItems.active, true),
    orderBy: (t, { asc }) => [asc(t.sortOrder)],
  });
  if (template.length) {
    await db.insert(schema.brandChecklistItems).values(
      template.map((t) => ({
        brandId,
        templateItemId: t.id,
        label: t.label,
        required: t.required,
        detailLabel: t.detailLabel,
        sortOrder: t.sortOrder,
      })),
    );
  }
}

/** Idempotent: fills empty reference tables and adds the five starter brands if there are none. */
export async function seedDatabase(db: Db) {
  const [{ value: stageCount }] = await db.select({ value: count() }).from(schema.pipelineStages);
  if (stageCount === 0) {
    await db.insert(schema.pipelineStages).values(
      DEFAULT_STAGES.map((s, i) => ({
        key: s.key,
        name: s.name,
        color: s.color,
        sortOrder: (i + 1) * 10,
        countsAsLive: s.countsAsLive ?? false,
        requiresChecklist: s.requiresChecklist ?? false,
        isTerminal: s.isTerminal ?? false,
      })),
    );
  }

  const [{ value: regionCount }] = await db.select({ value: count() }).from(schema.regions);
  if (regionCount === 0) {
    await db.insert(schema.regions).values(DEFAULT_REGIONS.map((name, i) => ({ name, sortOrder: (i + 1) * 10 })));
  }

  const [{ value: checklistCount }] = await db.select({ value: count() }).from(schema.checklistTemplateItems);
  if (checklistCount === 0) {
    await db.insert(schema.checklistTemplateItems).values(
      DEFAULT_CHECKLIST.map((c, i) => ({
        label: c.label,
        description: c.description,
        required: c.required ?? true,
        detailLabel: c.detailLabel,
        sortOrder: (i + 1) * 10,
      })),
    );
  }

  const [{ value: templateCount }] = await db.select({ value: count() }).from(schema.promptTemplates);
  if (templateCount === 0) {
    await db.insert(schema.promptTemplates).values([
      { key: "atlas", name: "Atlas", description: "Based on safari.com", body: PLACEHOLDER_TEMPLATE("Atlas", "safari.com") },
      { key: "vita", name: "Vita", description: "Based on vita-travel.webflow.io", body: PLACEHOLDER_TEMPLATE("Vita", "vita-travel.webflow.io") },
    ]);
  }

  const [{ value: brandCount }] = await db.select({ value: count() }).from(schema.brands);
  if (brandCount === 0) {
    const stage = await db.query.pipelineStages.findFirst({ where: eq(schema.pipelineStages.key, "prompt_ready") });
    const regionRows = await db.query.regions.findMany();
    if (!stage) return;
    for (const b of SEED_BRANDS) {
      const region = regionRows.find((r) => r.name === b.region);
      const [row] = await db
        .insert(schema.brands)
        .values({
          name: b.name,
          slug: slugify(b.name),
          country: b.country,
          countryCode: b.countryCode,
          regionId: region?.id,
          stageId: stage.id,
          designReference: b.designReference,
          designReferenceUrl: b.designReferenceUrl,
          contentReferenceUrls: b.contentReferenceUrls ?? [],
          paletteNotes: b.paletteNotes,
        })
        .returning({ id: schema.brands.id });
      await initializeBrandChildren(db, row.id);
      await db.insert(schema.activityLog).values({ brandId: row.id, action: "brand_created", actorName: "Seed", details: { name: b.name } });
    }
  }
}
