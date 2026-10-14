import { requireActor } from "@/lib/auth";
import { getMembers, getStages, getRegions } from "@/lib/data/reference";
import { getDb } from "@/db";
import { checklistTemplateItems } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StageBadge } from "@/components/stage-badge";
import { TeamSettings } from "./team-settings";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const actor = await requireActor();
  const db = await getDb();
  const [members, stages, regions, checklist] = await Promise.all([
    getMembers(false),
    getStages(),
    getRegions(),
    db.query.checklistTemplateItems.findMany({ orderBy: [asc(checklistTemplateItems.sortOrder)] }),
  ]);
  const isOwner = actor.role === "owner";

  return (
    <>
      <PageHeader title="Settings" description={isOwner ? "Manage the team and the reference lists." : "Only owners can change settings."} />
      <div className="grid gap-6 lg:grid-cols-2">
        <TeamSettings members={members} canManage={isOwner} selfId={actor.id} />

        <Card>
          <CardHeader>
            <CardTitle>Launch checklist template</CardTitle>
            <CardDescription>Every new brand gets these items. Editing arrives in Phase 3.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {checklist.map((c) => (
                <li key={c.id} className={c.active ? "" : "text-muted-foreground line-through"}>
                  {c.label}
                  {!c.required && <span className="ml-1 text-xs text-muted-foreground">(optional)</span>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pipeline stages</CardTitle>
            <CardDescription>Editing arrives with the Settings phase.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {stages.map((s) => (
              <StageBadge key={s.id} stage={s} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Regions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-sm">
            {regions.map((r) => (
              <span key={r.id} className="rounded-md border px-2 py-0.5">
                {r.name}
              </span>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
