import { requireActor } from "@/lib/auth";
import { getMembers, getStages, getRegions } from "@/lib/data/reference";
import { getDb } from "@/db";
import { checklistTemplateItems } from "@/db/schema";
import { asc, desc } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StageBadge } from "@/components/stage-badge";
import { TeamSettings } from "./team-settings";
import { ChecklistTemplateEditor } from "./checklist-template-editor";
import { SyncPanel } from "./sync-panel";
import { getSyncConfig, getSyncState, isSyncConfigured } from "@/lib/sync";
import { syncItems } from "@/db/schema";
import { canEdit } from "@/lib/auth";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const actor = await requireActor();
  const db = await getDb();
  const [members, stages, regions, checklist, syncState, allSyncItems] = await Promise.all([
    getMembers(false),
    getStages(),
    getRegions(),
    db.query.checklistTemplateItems.findMany({ orderBy: [asc(checklistTemplateItems.sortOrder)] }),
    getSyncState(),
    db.query.syncItems.findMany({ orderBy: [desc(syncItems.lastSeenAt)] }),
  ]);
  const syncCfg = getSyncConfig();
  const isOwner = actor.role === "owner";

  return (
    <>
      <PageHeader title="Settings" description={isOwner ? "Manage the team and the reference lists." : "Only owners can change settings."} />
      <div className="grid gap-6 lg:grid-cols-2">
        <SyncPanel
          configured={isSyncConfigured(syncCfg)}
          sources={{ vercel: Boolean(syncCfg.vercelToken), github: Boolean(syncCfg.githubOwner || syncCfg.vercelToken) }}
          last={syncState.last}
          pending={allSyncItems.filter((i) => i.status === "pending")}
          ignored={allSyncItems.filter((i) => i.status === "ignored")}
          canEdit={canEdit(actor.role)}
        />
        <TeamSettings members={members} canManage={isOwner} selfId={actor.id} />

        <ChecklistTemplateEditor items={checklist} canManage={isOwner} />

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
