import Link from "next/link";
import { getCountryOverview } from "@/lib/data/countries";
import { canEdit, getActor } from "@/lib/auth";
import { progressShading, PROGRESS_LEGEND } from "@/lib/progress";
import { getMapData } from "@/lib/data/map";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StageBadge } from "@/components/stage-badge";
import { WorldMap } from "@/components/world-map";
import { StatCard } from "@/components/stat-card";
import { PlanTable } from "./plan-table";

export const metadata = { title: "Countries" };

export default async function CountriesPage() {
  const [o, map, actor] = await Promise.all([getCountryOverview(), getMapData(), getActor()]);
  const editable = actor ? canEdit(actor.role) : false;
  const shading = progressShading(map.countries);
  const toDo = o.planned.filter((p) => !p.countryBrand && p.status !== "skipped");
  const upNext = toDo.filter((p) => p.status === "up_next").length;

  return (
    <>
      <PageHeader title="Countries" description="Where we have brands, and which countries to build next." />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Brands" value={o.brandCount} of={o.goal} note={`${o.brandsLeft} left to reach ${o.goal}`} />
        <StatCard label="Countries covered" value={o.covered.length} note="by a country or region brand" />
        <StatCard label="Countries live" value={o.liveCountries} note={`${o.liveBrands} brand${o.liveBrands === 1 ? "" : "s"} live`} />
        <StatCard label="On the plan" value={toDo.length} note={`${upNext} up next`} href="#plan" />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Map</CardTitle>
          <CardDescription>Same colours as the home map: how far each country&apos;s furthest-along site has got.</CardDescription>
        </CardHeader>
        <CardContent>
          <WorldMap shading={shading} stages={PROGRESS_LEGEND} />
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
