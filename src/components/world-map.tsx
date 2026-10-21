"use client";

import { useState } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { cn } from "@/lib/utils";
import type { CountryShade } from "@/lib/geo";
import type { PipelineStage } from "@/db/schema";
import world from "@/data/world-110m.json";

// Bundled (about 100 KB) so the map paints with the page instead of after a fetch.
const GEO = world as unknown as Parameters<typeof Geographies>[0]["geography"];

type View = { center: [number, number]; zoom: number };
const WORLD: View = { center: [10, 5], zoom: 1 };
// Quick views, so small countries (Switzerland, Rwanda, Bhutan…) are big enough to see.
const PRESETS: { label: string; view: View }[] = [
  { label: "World", view: WORLD },
  { label: "Europe", view: { center: [12, 52], zoom: 4 } },
  { label: "Africa", view: { center: [20, 2], zoom: 2.2 } },
  { label: "Asia", view: { center: [95, 25], zoom: 2.2 } },
  { label: "Americas", view: { center: [-75, 10], zoom: 1.7 } },
];
const MAX_ZOOM = 12;

type Hover = { x: number; y: number; name: string; shade?: CountryShade; plan?: string };

/** `planned`: map id → a short note ("Wave 1 · Up next") for countries on the plan without a brand yet. */
export function WorldMap({ shading, stages, planned }: { shading: Record<string, CountryShade>; stages: Pick<PipelineStage, "id" | "name" | "color">[]; planned?: Record<string, string> }) {
  const router = useRouter();
  const [hover, setHover] = useState<Hover | null>(null);
  const [view, setView] = useState<View>(WORLD);
  const zoomBy = (factor: number) => setView((v) => ({ ...v, zoom: Math.min(MAX_ZOOM, Math.max(1, v.zoom * factor)) }));

  const open = (name: string, shade?: CountryShade) => {
    if (!shade) return;
    if (shade.brands.length === 1) router.push(`/brands/${shade.brands[0].slug}`);
    else router.push(`/brands?q=${encodeURIComponent(name)}`);
  };

  return (
    <div className="relative">
      <ComposableMap projection="geoNaturalEarth1" projectionConfig={{ scale: 150, center: [10, 5] }} width={800} height={380} className="h-auto w-full">
        <ZoomableGroup
          center={view.center}
          zoom={view.zoom}
          minZoom={1}
          maxZoom={MAX_ZOOM}
          // Drag to move and pinch to zoom; the mouse wheel keeps scrolling the page.
          filterZoomEvent={(e) => e.type !== "wheel"}
          onMoveEnd={({ coordinates, zoom }) => coordinates && zoom && setView({ center: coordinates, zoom })}
        >
        <Geographies geography={GEO}>
          {({ geographies }) => {
            return (
              <>
                {geographies.map((geo) => {
                  const shade = shading[String(geo.id)];
                  const name = (geo.properties as { name?: string })?.name ?? "";
                  const plan = shade ? undefined : planned?.[String(geo.id)];
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY, name, shade, plan })}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => open(name, shade)}
                      className={shade ? "cursor-pointer outline-none transition-opacity hover:opacity-80" : "outline-none"}
                      style={{
                        fill: shade ? shade.color : plan ? "var(--map-planned)" : "var(--map-land)",
                        stroke: "var(--map-border)",
                        strokeWidth: (shade || plan ? 0.3 : 0.6) / view.zoom,
                      }}
                    />
                  );
                })}
              </>
            );
          }}
        </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      <div className="absolute top-0 right-0 flex flex-col items-end gap-1.5">
        <div className="flex overflow-hidden rounded-md border bg-card/90 text-xs shadow-xs backdrop-blur">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setView(p.view)}
              className={cn(
                "px-2 py-1 hover:bg-accent",
                view.center[0] === p.view.center[0] && view.center[1] === p.view.center[1] && view.zoom === p.view.zoom && "bg-accent font-medium",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex overflow-hidden rounded-md border bg-card/90 shadow-xs backdrop-blur">
          <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.6)} className="p-1.5 hover:bg-accent">
            <PlusIcon className="size-3.5" />
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.6)} className="border-l p-1.5 hover:bg-accent">
            <MinusIcon className="size-3.5" />
          </button>
        </div>
      </div>

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
            <div className="text-muted-foreground">{hover.plan ? `Planned · ${hover.plan}` : "No brand yet"}</div>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {stages.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} /> {s.name}
          </span>
        ))}
        {planned && Object.keys(planned).length > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ backgroundColor: "var(--map-planned)" }} /> Planned
          </span>
        )}
      </div>
    </div>
  );
}
