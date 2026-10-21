import Link from "next/link";
import { getCountryOverview } from "@/lib/data/countries";
import { getStages } from "@/lib/data/reference";
import { canEdit, getActor } from "@/lib/auth";
import { PLANNED_STATUS_LABELS } from "@/lib/constants";
import { buildCountryShading, mapIdForCountry } from "@/lib/geo";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StageBadge } from "@/components/stage-badge";
import { WorldMap } from "@/components/world-map";
import { PlanTable } from "./plan-table";

export const metadata = { title: "Countries" };

export default async function CountriesPage() {
  const [o, stages, actor] = await Promise.all([getCountryOverview(), getStages(), getActor()]);
  const editable = actor ? canEdit(actor.role) : false;
  const shading = buildCountryShading(o.brands);
  const toDo = o.planned.filter((p) => !p.countryBrand && p.status !== "skipped");
  const plannedOnMap: Record<string, string> = {};
  for (const p of toDo) {
    const id = mapIdForCountry(p.countryCode);
    if (id) plannedOnMap[id] = `Wave ${p.wave} · ${PLANNED_STATUS_LABELS[p.status]}`;
  }
  const upNext = toDo.filter((p) => p.status === "up_next").length;

  const stats = [
    { label: "Brands", value: `${o.brandCount} / ${o.goal}`, sub: `${o.brandsLeft} left to reach ${o.goal}` },
    { label: "Countries covered", value: o.covered.length, sub: "by a country or region brand" },
    { label: "Countries live", value: o.liveCountries, sub: `${o.liveBrands} brand${o.liveBrands === 1 ? "" : "s"} live` },
    { label: "On the plan", value: toDo.length, sub: `${upNext} up next` },
  ];

  return (
    <>
      <PageHeader title="Countries" description="Where we have brands, and which countries to build next." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="py-4">
            <CardContent>
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Progress value={o.brandCount} max={o.goal} className="mb-6 h-2" />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Map</CardTitle>
          <CardDescription>Coloured by each country&apos;s furthest-along brand. Planned countries without a brand are shaded pink.</CardDescription>
        </CardHeader>
        <CardContent>
          <WorldMap shading={shading} stages={stages.filter((s) => !s.isTerminal)} planned={plannedOnMap} />
        </CardContent>
      </Card>

      <Card id="plan" className="mb-6">
        <CardHeader>
          <CardTitle>Work on next</CardTitle>
          <CardDescription>
            Our plan, in waves. A country shows its brand&apos;s stage once a brand for it exists; until then, set its status here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlanTable rows={o.planned} editable={editable} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Countries we cover ({o.covered.length})</CardTitle>
          <CardDescription>Region brands count for each of their markets. Niche brands don&apos;t add countries.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Brands</TableHead>
                  <TableHead>Stage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {o.covered.map((c) => (
                  <TableRow key={c.code}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.region ?? "—"}</TableCell>
                    <TableCell>
                      {c.brands.map((b, i) => (
                        <span key={b.slug}>
                          {i > 0 && ", "}
                          <Link href={`/brands/${b.slug}`} className="hover:underline">
                            {b.name}
                          </Link>
                          {b.via === "region" && <span className="text-xs text-muted-foreground"> (region)</span>}
                        </span>
                      ))}
                    </TableCell>
                    <TableCell>
                      <StageBadge stage={c.stage} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
