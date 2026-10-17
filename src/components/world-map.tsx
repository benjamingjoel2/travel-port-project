"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import type { CountryShade } from "@/lib/geo";
import type { PipelineStage } from "@/db/schema";
import world from "@/data/world-110m.json";

// Bundled (about 100 KB) so the map paints with the page instead of after a fetch.
const GEO = world as unknown as Parameters<typeof Geographies>[0]["geography"];

type Hover = { x: number; y: number; name: string; shade?: CountryShade };

export function WorldMap({ shading, stages }: { shading: Record<string, CountryShade>; stages: Pick<PipelineStage, "id" | "name" | "color">[] }) {
  const router = useRouter();
  const [hover, setHover] = useState<Hover | null>(null);

  const open = (name: string, shade?: CountryShade) => {
    if (!shade) return;
    if (shade.brands.length === 1) router.push(`/brands/${shade.brands[0].slug}`);
    else router.push(`/brands?q=${encodeURIComponent(name)}`);
  };

  return (
    <div className="relative">
      <ComposableMap projection="geoNaturalEarth1" projectionConfig={{ scale: 150, center: [10, 5] }} width={800} height={380} className="h-auto w-full">
        <Geographies geography={GEO}>
          {({ geographies }) => {
            return (
              <>
                {geographies.map((geo) => {
                  const shade = shading[String(geo.id)];
                  const name = (geo.properties as { name?: string })?.name ?? "";
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY, name, shade })}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => open(name, shade)}
                      className={shade ? "cursor-pointer outline-none transition-opacity hover:opacity-80" : "outline-none"}
                      style={{ fill: shade ? shade.color : "var(--map-land)", stroke: "var(--map-border)", strokeWidth: 0.6 }}
                    />
                  );
                })}
              </>
            );
          }}
        </Geographies>
      </ComposableMap>

      {hover && (
        <div className="pointer-events-none fixed z-50 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          <div className="font-medium">{hover.name}</div>
          {hover.shade ? (
            hover.shade.brands.map((b) => (
              <div key={b.slug} className="text-muted-foreground">
                {b.name} · {b.stageName}
              </div>
            ))
          ) : (
            <div className="text-muted-foreground">No brand yet</div>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {stages.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} /> {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
