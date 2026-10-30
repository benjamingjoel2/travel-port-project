import type { Brand, PipelineStage } from "@/db/schema";

/**
 * How far a brand's website has really got, from what auto-sync found on GitHub and Vercel:
 * only a name, a GitHub repo, a Vercel preview link (*.vercel.app), or live on its own domain.
 */
export type SiteLevel = "idea" | "repo" | "preview" | "live";
export const SITE_LEVELS: SiteLevel[] = ["live", "preview", "repo", "idea"];
export const SITE_LEVEL_RANK: Record<SiteLevel, number> = { idea: 1, repo: 2, preview: 3, live: 4 };

type LevelInput = Pick<Brand, "repoUrl" | "vercelProjectUrl" | "vercelProjectId" | "stagingUrl" | "productionDomain"> & { stage: Pick<PipelineStage, "countsAsLive"> };

const isVercelApp = (url: string) => /^(https?:\/\/)?[^/]*\.vercel\.app(\/|$)/i.test(url.trim());

/** The brand's furthest level, plus the link that shows it (site, preview or repo). */
export function siteLevel(b: LevelInput): { level: SiteLevel; url: string | null } {
  const ownDomain = b.productionDomain && !isVercelApp(b.productionDomain) ? b.productionDomain : null;
  if (ownDomain || b.stage.countsAsLive) return { level: "live", url: ownDomain ?? b.stagingUrl ?? b.productionDomain ?? null };
  if (b.stagingUrl || b.productionDomain || b.vercelProjectUrl || b.vercelProjectId) {
    return { level: "preview", url: b.stagingUrl ?? b.productionDomain ?? b.vercelProjectUrl ?? null };
  }
  if (b.repoUrl) return { level: "repo", url: b.repoUrl };
  return { level: "idea", url: null };
}
