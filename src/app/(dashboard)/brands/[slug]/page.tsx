import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLinkIcon, GitBranchIcon, GlobeIcon, PencilIcon, TriangleIcon } from "lucide-react";
import { getBrandBySlug } from "@/lib/data/brands";
import { getStages } from "@/lib/data/reference";
import { getActor, canEdit } from "@/lib/auth";
import { DESIGN_REFERENCE_LABELS, PRIORITY_LABELS } from "@/lib/constants";
import { formatDate, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandLogo } from "@/components/brand-logo";
import { PriorityBadge } from "@/components/stage-badge";
import { ProgressPill } from "@/components/progress-pill";
import { PhaseList } from "@/components/phase-list";
import { StageSelect } from "@/components/stage-select";
import { ActivityList } from "@/components/activity-list";
import { ChecklistPanel } from "@/components/checklist-panel";
import { NotesPanel } from "@/components/notes-panel";
import { BlockersPanel } from "@/components/blockers-panel";

export async function generateMetadata({ params }: PageProps<"/brands/[slug]">) {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);
  return { title: brand?.name ?? "Brand" };
}

function href(url: string | null | undefined) {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export default async function BrandDetailPage({ params }: PageProps<"/brands/[slug]">) {
  const { slug } = await params;
  const [brand, stages, actor] = await Promise.all([getBrandBySlug(slug), getStages(), getActor()]);
  if (!brand) notFound();
  const editable = actor ? canEdit(actor.role) : false;
  const phasesDone = brand.phases.filter((p) => p.status === "done").length;
  const checklistDone = brand.checklist.filter((c) => c.done).length;
  const missingRequired = brand.checklist.filter((c) => c.required && !c.done);
  const openBlockers = brand.blockers.filter((b) => !b.resolvedAt);

  const links = [
    { label: "Repo", url: href(brand.repoUrl), icon: GitBranchIcon },
    { label: "Vercel", url: href(brand.vercelProjectUrl), icon: TriangleIcon },
    { label: "Staging", url: href(brand.stagingUrl), icon: ExternalLinkIcon },
    { label: "Live site", url: href(brand.productionDomain), icon: GlobeIcon },
  ].filter((l) => l.url);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <BrandLogo name={brand.name} logoUrl={brand.logoUrl} logoData={brand.logoData} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{brand.name}</h1>
            <StageSelect brandId={brand.id} stages={stages} current={brand.stage} disabled={!editable} missingRequired={missingRequired.map((m) => m.label)} />
            {openBlockers.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                <span className="size-2 rounded-full bg-destructive" /> {openBlockers.length} blocker{openBlockers.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>{brand.country}</span>
            {brand.region && <span>· {brand.region.name}</span>}
            <span>· {DESIGN_REFERENCE_LABELS[brand.designReference]}</span>
            {brand.owner && <span>· Owner: {brand.owner.name}</span>}
            <PriorityBadge priority={brand.priority} />
            {brand.targetLaunchDate && <span>· Target {formatDate(brand.targetLaunchDate)}</span>}
            {brand.launchedAt && <span>· Launched {formatDate(brand.launchedAt)}</span>}
          </div>
          {links.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {links.map((l) => (
                <Button key={l.label} asChild variant="outline" size="sm">
                  <a href={l.url!} target="_blank" rel="noreferrer">
                    <l.icon /> {l.label}
                  </a>
                </Button>
              ))}
            </div>
          )}
        </div>
        {editable && (
          <Button asChild variant="outline">
            <Link href={`/brands/${brand.slug}/edit`}>
              <PencilIcon /> Edit
            </Link>
          </Button>
        )}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Build phases</span>
            <ProgressPill done={phasesDone} total={brand.phases.length} />
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Launch checklist</span>
            <ProgressPill done={checklistDone} total={brand.checklist.length} />
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Last updated</span>
            <span className="text-sm">{timeAgo(brand.updatedAt)}</span>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="build">
        <TabsList>
          <TabsTrigger value="build">Build</TabsTrigger>
          <TabsTrigger value="checklist">Checklist</TabsTrigger>
          <TabsTrigger value="prompt">Prompt</TabsTrigger>
          <TabsTrigger value="notes">
            Notes &amp; blockers{openBlockers.length > 0 && <span className="ml-1 size-1.5 rounded-full bg-destructive" />}
          </TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>

        <TabsContent value="build">
          <Card>
            <CardHeader>
              <CardTitle>Build phases</CardTitle>
              <CardDescription>Every prompt builds in these five phases. Tick them off as Claude Code finishes each one.</CardDescription>
            </CardHeader>
            <CardContent>
              <PhaseList phases={brand.phases} editable={editable} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="checklist">
          <Card>
            <CardHeader>
              <CardTitle>Launch checklist</CardTitle>
              <CardDescription>Every required item must be ticked before this brand can move to Live.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChecklistPanel brandId={brand.id} items={brand.checklist} editable={editable} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prompt">
          <Card>
            <CardHeader>
              <CardTitle>Prompt</CardTitle>
              <CardDescription>Prompt storage, versions, diffs and the generator arrive in Phase 4.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{brand.prompts.length === 0 ? "No prompt saved yet." : `${brand.prompts.length} version(s) saved.`}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Blockers</CardTitle>
                <CardDescription>Open blockers show as a red marker on the board and on the Overview.</CardDescription>
              </CardHeader>
              <CardContent>
                <BlockersPanel brandId={brand.id} blockers={brand.blockers} editable={editable} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <NotesPanel brandId={brand.id} notes={brand.notes} editable={editable} actorId={actor?.id} isOwner={actor?.role === "owner"} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityList entries={brand.activity} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="about">
          <Card>
            <CardHeader>
              <CardTitle>About this brand</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
              <Detail label="Brand story">{brand.brandStory || "—"}</Detail>
              <Detail label="Palette notes">{brand.paletteNotes || "—"}</Detail>
              <Detail label="Design reference">
                {DESIGN_REFERENCE_LABELS[brand.designReference]}
                {brand.designReferenceUrl && (
                  <>
                    {" "}
                    · <a className="underline" href={href(brand.designReferenceUrl)!} target="_blank" rel="noreferrer">{brand.designReferenceUrl}</a>
                  </>
                )}
              </Detail>
              <Detail label="Content references">
                {brand.contentReferenceUrls.length === 0 ? "—" : (
                  <ul className="list-disc pl-4">
                    {brand.contentReferenceUrls.map((u, i) => (
                      <li key={i} className="break-all">{u}</li>
                    ))}
                  </ul>
                )}
              </Detail>
              <Detail label="Priority">{PRIORITY_LABELS[brand.priority]}</Detail>
              <Detail label="Created">{formatDate(brand.createdAt)}</Detail>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground uppercase">{label}</div>
      <div className="whitespace-pre-wrap">{children}</div>
    </div>
  );
}
