import { cn } from "@/lib/utils";

export function BrandLogo({ name, logoUrl, logoData, size = 32, className }: { name: string; logoUrl?: string | null; logoData?: string | null; size?: number; className?: string }) {
  const src = logoData || logoUrl || null;
  const initials = name
    .replace(/&/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className={cn("shrink-0 rounded-md border bg-white object-contain", className)} style={{ width: size, height: size }} />;
  }
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-md border bg-muted font-semibold text-muted-foreground", className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
