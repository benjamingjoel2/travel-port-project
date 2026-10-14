"use client";

import { useState, useTransition } from "react";
import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import type { SyncItem } from "@/db/schema";
import type { SyncSummary } from "@/lib/sync/engine";
import { addSyncItemAsBrand, runSyncNow, setSyncItemStatus } from "@/lib/actions/sync";
import { timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CountryCombobox } from "@/components/country-combobox";

type Props = {
  configured: boolean;
  sources: { vercel: boolean; github: boolean };
  last?: SyncSummary;
  pending: SyncItem[];
  ignored: SyncItem[];
  canEdit: boolean;
};

export function SyncPanel({ configured, sources, last, pending, ignored, canEdit }: Props) {
  const [pendingTx, start] = useTransition();
  const vercelItems = pending.filter((p) => p.kind === "vercel");
  const githubItems = pending.filter((p) => p.kind === "github");

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Auto-sync with Vercel and GitHub</CardTitle>
            <CardDescription className="mt-1">
              {configured
                ? "New projects are picked up automatically every 10 minutes while someone is using the tracker, and once a night."
                : "Not connected yet. See the README for the two settings it needs."}
            </CardDescription>
          </div>
          {configured && canEdit && (
            <Button
              variant="outline"
              size="sm"
              disabled={pendingTx}
              onClick={() =>
                start(async () => {
                  const res = await runSyncNow();
                  if (res.ok) toast.success(res.message ?? "Synced");
                  else toast.error(res.error);
                })
              }
            >
              <RefreshCwIcon className={pendingTx ? "animate-spin" : ""} /> Sync now
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
          <span>Vercel: {!sources.vercel ? "not connected" : last ? `${last.vercelProjects} projects` : "connected"}</span>
          <span>GitHub: {!sources.github ? "not connected" : last ? (last.githubRepos ? `${last.githubRepos} repos` : "couldn't read repos") : "connected"}</span>
          {last && (
            <span>
              Last sync {timeAgo(last.at)}
              {!last.ok && <span className="text-destructive">: {last.error}</span>}
            </span>
          )}
        </div>
        {last?.warnings?.length ? <p className="text-xs text-destructive">{last.warnings.join(" · ")}</p> : null}

        {pending.length > 0 && (
          <div className="space-y-2">
            <div className="font-medium">Needs a country ({pending.length})</div>
            <p className="text-xs text-muted-foreground">
              These projects don&apos;t say which country they cover. Pick one to add it as a brand, or ignore it if it isn&apos;t a travel brand.
            </p>
            <ul className="divide-y rounded-md border">
              {vercelItems.map((item) => (
                <ReviewRow key={item.id} item={item} canEdit={canEdit} />
              ))}
            </ul>
            {githubItems.length > 0 && (
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">GitHub repos with no Vercel project ({githubItems.length})</summary>
                <ul className="mt-2 divide-y rounded-md border">
                  {githubItems.map((item) => (
                    <ReviewRow key={item.id} item={item} canEdit={canEdit} />
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {ignored.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">Ignored ({ignored.length})</summary>
            <ul className="mt-2 divide-y rounded-md border">
              {ignored.map((item) => (
                <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1 text-muted-foreground">
                    {item.name} <span className="text-xs">({item.kind === "vercel" ? "Vercel" : "GitHub"})</span>
                  </span>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pendingTx}
                      onClick={() =>
                        start(async () => {
                          const res = await setSyncItemStatus(item.id, "pending");
                          if (!res.ok) toast.error(res.error);
                        })
                      }
                    >
                      Restore
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewRow({ item, canEdit }: { item: SyncItem; canEdit: boolean }) {
  const [country, setCountry] = useState("");
  const [pending, start] = useTransition();
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2">
      <div className="min-w-40 flex-1">
        <div className="font-medium">{item.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {item.kind === "vercel" ? "Vercel project" : "GitHub repo"}
          {item.repo && ` · ${item.repo}`}
        </div>
      </div>
      {canEdit && (
        <>
          <div className="w-52">
            <CountryCombobox value={country} onChange={(code) => setCountry(code)} />
          </div>
          <Button
            size="sm"
            disabled={pending || !country}
            onClick={() =>
              start(async () => {
                const res = await addSyncItemAsBrand(item.id, country);
                if (res.ok) toast.success(res.message ?? "Added");
                else toast.error(res.error);
              })
            }
          >
            Add as brand
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await setSyncItemStatus(item.id, "ignored");
                if (!res.ok) toast.error(res.error);
              })
            }
          >
            Ignore
          </Button>
        </>
      )}
    </li>
  );
}
