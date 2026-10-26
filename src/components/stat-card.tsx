import Link from "next/link";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

/** A headline number: small caps label, big serif figure, optional progress toward a goal. */
export function StatCard({ label, value, of, note, href }: { label: string; value: number; of?: number; note: string; href?: string }) {
  const body = (
    <>
      <div className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">{label}</div>
      <div className="mt-2 text-4xl font-semibold tabular-nums">
        {value}
        {of && <span className="text-xl text-muted-foreground">/{of}</span>}
      </div>
      {of && <Progress value={value} max={of} className="mt-3 h-1" indicatorClassName="bg-terra" />}
      <div className="mt-2 text-xs text-muted-foreground">{note}</div>
    </>
  );
  const className = cn(
    "rounded-md border bg-card p-5",
    href && "transition-colors hover:border-terra/40",
  );
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
