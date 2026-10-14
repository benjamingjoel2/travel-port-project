import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from "lucide-react";
import { listBrands, type BrandFilters, type BrandSort } from "@/lib/data/brands";
import { getReferenceData } from "@/lib/data/reference";
import { DESIGN_REFERENCE_LABELS } from "@/lib/constants";
import { daysUntil, formatDate, timeAgo } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StageBadge, PriorityBadge } from "@/components/stage-badge";
import { BrandLogo } from "@/components/brand-logo";
import { ProgressPill } from "@/components/progress-pill";
import { BrandFilterBar } from "./filter-bar";
import { DeployDot } from "@/components/deploy-status";

export const metadata = { title: "Brands" };

const SORTS: BrandSort[] = ["name", "country", "region", "stage", "phases", "checklist", "owner", "priority", "target", "activity", "updated"];

function SortHead({ k, sort, dir, href, children, className }: { k: BrandSort; sort: BrandSort; dir: "asc" | "desc"; href: string; children: React.ReactNode; className?: string }) {
  return (
    <TableHead className={className}>
      <Link href={href} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}
        {sort === k && (dir === "desc" ? <ArrowDownIcon className="size-3" /> : <ArrowUpIcon className="size-3" />)}
      </Link>
    </TableHead>
  );
}

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function BrandsPage({ searchParams }: PageProps<"/brands">) {
  const sp = await searchParams;
  const filters: BrandFilters = {
    q: first(sp.q),
    stage: first(sp.stage),
    region: first(sp.region),
    owner: first(sp.owner),
    priority: first(sp.priority),
    sort: SORTS.includes(first(sp.sort) as BrandSort) ? (first(sp.sort) as BrandSort) : "updated",
    dir: first(sp.dir) === "desc" ? "desc" : "asc",
  };
  const [brands, ref] = await Promise.all([listBrands(filters), getReferenceData()]);

  const sortLink = (key: BrandSort) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v && k !== "sort" && k !== "dir") params.set(k, v);
    params.set("sort", key);
    const isActive = filters.sort === key;
    params.set("dir", isActive && filters.dir === "asc" ? "desc" : "asc");
    return `/brands?${params.toString()}`;
  };


  return (
    <>
      <PageHeader
        title="Brands"
        description={`${brands.length} shown`}
        actions={
          <Button asChild>
            <Link href="/brands/new">
              <PlusIcon /> New brand
            </Link>
          </Button>
        }
      />

      <BrandFilterBar stages={ref.stages} regions={ref.regions} members={ref.members} current={filters} />

      <div className="mt-4 rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead k="name" sort={filters.sort!} dir={filters.dir!} href={sortLink("name")}>Brand</SortHead>
              <SortHead k="country" sort={filters.sort!} dir={filters.dir!} href={sortLink("country")}>Country</SortHead>
              <SortHead k="region" sort={filters.sort!} dir={filters.dir!} href={sortLink("region")}>Region</SortHead>
              <SortHead k="stage" sort={filters.sort!} dir={filters.dir!} href={sortLink("stage")}>Stage</SortHead>
              <TableHead>Reference</TableHead>
              <SortHead k="phases" sort={filters.sort!} dir={filters.dir!} href={sortLink("phases")}>Phases</SortHead>
              <SortHead k="checklist" sort={filters.sort!} dir={filters.dir!} href={sortLink("checklist")}>Checklist</SortHead>
              <SortHead k="owner" sort={filters.sort!} dir={filters.dir!} href={sortLink("owner")}>Owner</SortHead>
              <SortHead k="priority" sort={filters.sort!} dir={filters.dir!} href={sortLink("priority")}>Priority</SortHead>
              <SortHead k="target" sort={filters.sort!} dir={filters.dir!} href={sortLink("target")}>Target</SortHead>
              <SortHead k="activity" sort={filters.sort!} dir={filters.dir!} href={sortLink("activity")}>Build activity</SortHead>
              <SortHead k="updated" sort={filters.sort!} dir={filters.dir!} href={sortLink("updated")}>Updated</SortHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {brands.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="py-10 text-center text-muted-foreground">
                  No brands match. <Link href="/brands" className="underline">Clear filters</Link> or <Link href="/brands/new" className="underline">add one</Link>.
                </TableCell>
              </TableRow>
            )}
            {brands.map((b) => {
              const days = daysUntil(b.targetLaunchDate);
              const overdue = days !== null && days < 0 && !b.stage.countsAsLive && !b.stage.isTerminal;
              return (
                <TableRow key={b.id}>
                  <TableCell>
                    <Link href={`/brands/${b.slug}`} className="flex items-center gap-2.5 font-medium hover:underline">
                      <BrandLogo name={b.name} logoUrl={b.logoUrl} logoData={b.logoData} size={26} />
                      {b.name}
                      {b.openBlockers > 0 && <span className="size-2 rounded-full bg-destructive" title={`${b.openBlockers} open blocker(s)`} />}
                    </Link>
                  </TableCell>
                  <TableCell>{b.country}</TableCell>
                  <TableCell className="text-muted-foreground">{b.region?.name ?? "—"}</TableCell>
                  <TableCell>
                    <StageBadge stage={b.stage} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{DESIGN_REFERENCE_LABELS[b.designReference].split(" ")[0]}</TableCell>
                  <TableCell>
                    <ProgressPill done={b.phasesDone} total={b.phasesTotal} />
                  </TableCell>
                  <TableCell>
                    <ProgressPill done={b.checklistDone} total={b.checklistTotal} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{b.owner?.name ?? "—"}</TableCell>
                  <TableCell>
                    <PriorityBadge priority={b.priority} />
                  </TableCell>
                  <TableCell className={overdue ? "text-destructive" : "text-muted-foreground"}>{formatDate(b.targetLaunchDate)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {b.activity.at ? (
                      <span className="inline-flex items-center gap-1.5" title={b.activity.deploy?.commitMessage ?? undefined}>
                        {b.activity.deploy && <DeployDot state={b.activity.deploy.state} />}
                        {timeAgo(b.activity.at)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{timeAgo(b.updatedAt)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
