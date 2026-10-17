import Link from "next/link";
import { listBrands } from "@/lib/data/brands";
import { getStages } from "@/lib/data/reference";
import { canEdit, getActor } from "@/lib/auth";
import { BRAND_TYPES, BRAND_TYPE_LABELS } from "@/lib/constants";
import type { BrandType } from "@/db/schema";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { PipelineBoard } from "@/components/pipeline-board";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: PageProps<"/pipeline">) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.type) ? sp.type[0] : sp.type;
  const type = BRAND_TYPES.includes(raw as BrandType) ? (raw as BrandType) : undefined;
  const [all, stages, actor] = await Promise.all([listBrands(), getStages(), getActor()]);
  const brands = type ? all.filter((b) => b.brandType === type) : all;
  const editable = actor ? canEdit(actor.role) : false;
  const options: { key?: BrandType; label: string; count: number }[] = [
    { label: "All types", count: all.length },
    ...BRAND_TYPES.map((t) => ({ key: t, label: BRAND_TYPE_LABELS[t], count: all.filter((b) => b.brandType === t).length })),
  ];
  return (
    <>
      <PageHeader title="Pipeline" description={editable ? "Drag a card to change its stage. Live needs the launch checklist complete." : "Drag-and-drop is available to editors."} />
      <nav aria-label="Brand type" className="mb-4 inline-flex rounded-lg border bg-card p-0.5 text-sm">
        {options.map((o) => (
          <Link
            key={o.label}
            href={o.key ? `/pipeline?type=${o.key}` : "/pipeline"}
            aria-current={o.key === type ? "page" : undefined}
            className={cn("rounded-md px-3 py-1 text-muted-foreground hover:text-foreground", o.key === type && "bg-muted font-medium text-foreground")}
          >
            {o.label} <span className="text-xs tabular-nums opacity-70">{o.count}</span>
          </Link>
        ))}
      </nav>
      <PipelineBoard brands={brands} stages={stages} editable={editable} />
    </>
  );
}
