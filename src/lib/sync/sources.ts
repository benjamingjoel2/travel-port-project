import "server-only";

export type DeployInfo = {
  state: string | null;
  createdAt: number | null;
  url: string | null;
  target: string | null;
  branch: string | null;
  commitMessage: string | null;
  commitSha: string | null;
  commitAuthor: string | null;
};

export type VercelProject = {
  id: string;
  name: string;
  repo: string | null; // "owner/repo", lowercase
  repoUrl: string | null;
  projectUrl: string;
  stagingUrl: string | null;
  customDomain: string | null;
  production: DeployInfo | null;
  latest: DeployInfo | null;
  createdAt: number;
};

export type GithubRepo = {
  fullName: string; // lowercase
  name: string;
  htmlUrl: string;
  pushedAt: string | null;
  private: boolean;
};

type RawDeployment = {
  readyState?: string;
  createdAt?: number;
  url?: string;
  target?: string | null;
  alias?: string[];
  meta?: Record<string, string>;
};

function toDeploy(d: RawDeployment | undefined | null): DeployInfo | null {
  if (!d) return null;
  const m = d.meta ?? {};
  return {
    state: d.readyState ?? null,
    createdAt: d.createdAt ?? null,
    url: d.url ? `https://${d.url}` : null,
    target: d.target ?? null,
    branch: m.githubCommitRef ?? null,
    commitMessage: m.githubCommitMessage ? m.githubCommitMessage.split("\n")[0].slice(0, 200) : null,
    commitSha: m.githubCommitSha ?? null,
    commitAuthor: m.githubCommitAuthorName ?? null,
  };
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return (await res.json()) as T;
}

export async function listVercelProjects(token: string, teamId: string | undefined): Promise<{ projects: VercelProject[]; teamSlug: string | null }> {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const qs = (extra: string) => `?${teamId ? `teamId=${encodeURIComponent(teamId)}&` : ""}${extra}`;
  let teamSlug: string | null = null;
  if (teamId) {
    try {
      teamSlug = (await fetchJson<{ slug?: string }>(`https://api.vercel.com/v2/teams/${teamId}`, auth)).slug ?? null;
    } catch {
      teamSlug = null;
    }
  }
  const out: VercelProject[] = [];
  let next: number | null = null;
  for (let page = 0; page < 10; page++) {
    const data: { projects: Record<string, unknown>[]; pagination?: { next: number | null } } = await fetchJson(
      `https://api.vercel.com/v9/projects${qs(`limit=100${next ? `&until=${next}` : ""}`)}`,
      auth,
    );
    for (const p of data.projects) {
      const link = (p.link ?? {}) as { type?: string; org?: string; repo?: string };
      const prodRaw = ((p.targets ?? {}) as Record<string, RawDeployment>).production;
      const latestRaw = ((p.latestDeployments ?? []) as RawDeployment[])[0];
      const aliases = prodRaw?.alias ?? [];
      const customDomain = aliases.find((a) => !a.endsWith(".vercel.app")) ?? null;
      const vercelAlias = aliases.find((a) => a.endsWith(".vercel.app") && !a.includes("-git-")) ?? null;
      const name = String(p.name);
      out.push({
        id: String(p.id),
        name,
        repo: link.type === "github" && link.org && link.repo ? `${link.org}/${link.repo}`.toLowerCase() : null,
        repoUrl: link.type === "github" && link.org && link.repo ? `https://github.com/${link.org}/${link.repo}` : null,
        projectUrl: teamSlug ? `https://vercel.com/${teamSlug}/${name}` : `https://vercel.com/dashboard`,
        stagingUrl: vercelAlias ? `https://${vercelAlias}` : null,
        customDomain,
        production: toDeploy(prodRaw),
        latest: toDeploy(latestRaw) ?? toDeploy(prodRaw),
        createdAt: Number(p.createdAt ?? 0),
      });
    }
    next = data.pagination?.next ?? null;
    if (!next) break;
  }
  return { projects: out, teamSlug };
}

export async function listGithubRepos(owner: string, token?: string): Promise<GithubRepo[]> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "build-tracker" };
  if (token) headers.Authorization = `Bearer ${token}`;
  // With a token we can see private repos too; without one, public repos only.
  const base = token ? `https://api.github.com/user/repos?affiliation=owner&per_page=100&sort=pushed` : `https://api.github.com/users/${encodeURIComponent(owner)}/repos?per_page=100&sort=pushed`;
  const out: GithubRepo[] = [];
  for (let page = 1; page <= 5; page++) {
    const rows = await fetchJson<{ full_name: string; name: string; html_url: string; pushed_at: string | null; private: boolean; owner: { login: string } }[]>(`${base}&page=${page}`, { headers });
    for (const r of rows) {
      if (r.owner.login.toLowerCase() !== owner.toLowerCase()) continue;
      out.push({ fullName: r.full_name.toLowerCase(), name: r.name, htmlUrl: r.html_url, pushedAt: r.pushed_at, private: r.private });
    }
    if (rows.length < 100) break;
  }
  return out;
}

/**
 * The most recently updated repos (about 8), read through Vercel's own GitHub
 * connection. No GitHub token or rate limit involved, and new projects are always
 * among the most recent, so this is what makes new repos show up within a minute.
 */
export async function listRecentReposViaVercel(token: string, teamId: string | undefined): Promise<GithubRepo[]> {
  const qs = teamId ? `&teamId=${encodeURIComponent(teamId)}` : "";
  const data = await fetchJson<{ repos?: { url: string; name: string; namespace?: string; owner?: { name?: string }; private?: boolean; updatedAt?: number; provider?: string }[] }>(
    `https://api.vercel.com/v1/integrations/search-repo?provider=github${qs}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return (data.repos ?? [])
    .filter((r) => (r.provider ?? "github") === "github")
    .map((r) => {
      const owner = r.namespace ?? r.owner?.name ?? "";
      return {
        fullName: `${owner}/${r.name}`.toLowerCase(),
        name: r.name,
        htmlUrl: r.url,
        pushedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
        private: Boolean(r.private),
      };
    });
}

/**
 * Every repo the Vercel GitHub connection can see, private ones included, without a
 * GitHub token. Vercel's repo search matches word prefixes and returns a handful of
 * results per query, so searching each letter and digit covers the whole account;
 * any query that comes back full is widened to two-character prefixes.
 */
export async function listAllReposViaVercel(token: string, teamId: string | undefined): Promise<GithubRepo[]> {
  const qs = teamId ? `&teamId=${encodeURIComponent(teamId)}` : "";
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
  const queue = [...chars];
  const byName = new Map<string, GithubRepo>();
  let ok = 0;
  let failed = 0;
  const FULL_PAGE = 8;

  const run = async (q: string) => {
    try {
      const data = await fetchJson<{ repos?: { url: string; name: string; namespace?: string; owner?: { name?: string }; private?: boolean; updatedAt?: number; provider?: string }[] }>(
        `https://api.vercel.com/v1/integrations/search-repo?provider=github&query=${encodeURIComponent(q)}${qs}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      ok++;
      const repos = data.repos ?? [];
      for (const r of repos) {
        if ((r.provider ?? "github") !== "github") continue;
        const owner = r.namespace ?? r.owner?.name ?? "";
        const fullName = `${owner}/${r.name}`.toLowerCase();
        if (!byName.has(fullName)) {
          byName.set(fullName, { fullName, name: r.name, htmlUrl: r.url, pushedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null, private: Boolean(r.private) });
        }
      }
      if (repos.length >= FULL_PAGE && q.length < 3) queue.push(...chars.map((c) => q + c));
    } catch {
      failed++;
    }
  };

  // A few at a time keeps this to a couple of seconds without hammering the API.
  while (queue.length) await Promise.all(queue.splice(0, 6).map(run));
  if (ok === 0 && failed > 0) throw new Error("Vercel repo search failed");
  return [...byName.values()];
}

/** Visible text of a deployed site (title, description, body) for country detection. */
export async function fetchSiteText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(8_000), headers: { "User-Agent": "build-tracker" } });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/html")) return "";
    const html = (await res.text()).slice(0, 300_000);
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z#0-9]+;/gi, " ");
  } catch {
    return "";
  }
}

/** README.md + CLAUDE.md text for country detection. Empty string when unreachable. */
export async function fetchRepoDocs(fullName: string, token?: string): Promise<string> {
  const headers: Record<string, string> = { "User-Agent": "build-tracker" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const parts = await Promise.all(
    ["README.md", "CLAUDE.md"].map(async (file) => {
      try {
        const res = await fetch(`https://raw.githubusercontent.com/${fullName}/HEAD/${file}`, { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) });
        return res.ok ? (await res.text()).slice(0, 100_000) : "";
      } catch {
        return "";
      }
    }),
  );
  return parts.join("\n");
}
