import type { IntegrationSnapshot } from "@/db/schema";
import type { DeployInfo } from "@/lib/sync/sources";

export type BrandActivity = {
  /** Most recent deploy (any branch) or push, whichever is newer. */
  at: Date | null;
  deploy: DeployInfo | null;
  production: DeployInfo | null;
  pushedAt: Date | null;
};

export function brandActivity(snapshots: Pick<IntegrationSnapshot, "kind" | "data">[]): BrandActivity {
  const vercel = snapshots.find((s) => s.kind === "vercel")?.data as { latest?: DeployInfo | null; production?: DeployInfo | null } | undefined;
  const github = snapshots.find((s) => s.kind === "github")?.data as { pushedAt?: string | null } | undefined;
  const deploy = vercel?.latest ?? null;
  const pushedAt = github?.pushedAt ? new Date(github.pushedAt) : null;
  const deployAt = deploy?.createdAt ? new Date(deploy.createdAt) : null;
  const at = [deployAt, pushedAt].filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return { at, deploy, production: vercel?.production ?? null, pushedAt };
}

export function deployStateLabel(state: string | null | undefined): { label: string; tone: "ok" | "busy" | "bad" | "muted" } {
  switch (state) {
    case "READY":
      return { label: "Ready", tone: "ok" };
    case "BUILDING":
    case "INITIALIZING":
    case "QUEUED":
      return { label: "Building", tone: "busy" };
    case "ERROR":
      return { label: "Failed", tone: "bad" };
    case "CANCELED":
      return { label: "Canceled", tone: "muted" };
    default:
      return { label: "No deploys", tone: "muted" };
  }
}
