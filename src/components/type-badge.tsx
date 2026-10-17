import type { BrandType } from "@/db/schema";
import { BRAND_TYPE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const STYLES: Record<BrandType, string> = {
  country: "bg-muted text-muted-foreground",
  region: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  niche: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
};

export function TypeBadge({ type, className }: { type: BrandType; className?: string }) {
  return <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap", STYLES[type], className)}>{BRAND_TYPE_LABELS[type]}</span>;
}
