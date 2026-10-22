"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { geoArea, geoCentroid, geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import { ArrowUpRightIcon, InfoIcon, LocateFixedIcon, LogOutIcon, MenuIcon, MinusIcon, PlusIcon, XIcon } from "lucide-react";
import world from "@/data/world-110m.json";
import type { MapCountry, MapData, MapSearchBrand, MapStatus } from "@/lib/data/map";
import { labelPoint, mainPart, type CountryShape } from "@/lib/map-shapes";
import { NAV } from "@/components/app-sidebar";
import { signOut } from "@/app/login/actions";
import { cn } from "@/lib/utils";

const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name?: string }> }>;
type Shape = { id: string; name: string; geo: CountryShape; label: [number, number]; area: number };
const SHAPES: Shape[] = (feature(topo, topo.objects.countries) as FeatureCollection<Polygon | MultiPolygon, { name?: string }>).features.map((f, i) => ({
  id: f.id === undefined ? `x${i}` : String(f.id),
  name: f.properties?.name ?? "",
  geo: f,
  label: labelPoint(f),
  area: geoArea(mainPart(f)),
}));
const SHAPE_BY_ID = new Map(SHAPES.map((s) => [s.id, s]));
const GRATICULE = geoGraticule10();

// Starlink-style palette: black ocean, graphite land, blues for where we are.
const OCEAN = "#050506";
const LAND = "#262628";
const BORDER = "#3c3c3f";
const STATUS: Record<MapStatus, { label: string; color: string }> = {
  live: { label: "Live", color: "#669eda" },
  progress: { label: "In progress", color: "#3d6ea3" },
  planned: { label: "Planned", color: "#1e2f42" },
};

type View = { rotate: [number, number]; zoom: number };
// Centred between Europe, Africa and the Middle East, where most brands are.
const HOME: View = { rotate: [-22, -18], zoom: 1 };
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 14;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
const viewOn = ([lon, lat]: [number, number], zoom: number): View => ({ rotate: [-lon, -lat], zoom: clampZoom(zoom) });
// Small countries need a closer look: Switzerland ends up near 10x, Kenya near 3.5x.
const zoomForArea = (area: number) => Math.min(11, Math.max(1.3, 0.65 * Math.pow(area, -0.4)));

type Mode = "status" | "stages";
type Selection = { kind: "country"; id: string } | { kind: "brand"; slug: string } | null;
type Suggestion = { key: string; label: string; detail: string; color: string; pick: () => void };

export function GlobeExplorer({ data, stages, actorName }: { data: MapData; stages: { id: string; name: string; color: string }[]; actorName: string }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>(HOME);
  const viewRef = useRef(view);
  const anim = useRef<number | null>(null);
  const [mode, setMode] = useState<Mode>("status");
  const [selected, setSelected] = useState<Selection>(null);
  const [hover, setHover] = useState<{ x: number; y: number; id: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function stopFlight() {
    if (anim.current !== null) cancelAnimationFrame(anim.current);
    anim.current = null;
  }
  useEffect(() => () => stopFlight(), []);

  function flyTo(target: View) {
    stopFlight();
    const from = viewRef.current;
    const dLon = ((((target.rotate[0] - from.rotate[0]) % 360) + 540) % 360) - 180;
    const dLat = target.rotate[1] - from.rotate[1];
    const duration = 1100;
    let start: number | null = null;
    const step = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / duration);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      setView({ rotate: [from.rotate[0] + dLon * e, from.rotate[1] + dLat * e], zoom: from.zoom * Math.pow(target.zoom / from.zoom, e) });
      anim.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    anim.current = requestAnimationFrame(step);
  }

  const zoomBy = (factor: number) => {
    stopFlight();
    setView((v) => ({ ...v, zoom: clampZoom(v.zoom * factor) }));
  };

  // ---- projection ----
  const radius = Math.min(size.w * (size.w < 640 ? 0.47 : 0.44), size.h * 0.4) * view.zoom;
  const cx = size.w / 2;
  const cy = size.h * (size.w < 640 ? 0.42 : 0.47);
  const projection = useMemo(() => geoOrthographic().rotate(view.rotate).scale(radius).translate([cx, cy]).clipAngle(90).precision(0.4), [view.rotate, radius, cx, cy]);
  const path = useMemo(() => geoPath(projection), [projection]);
  const centre: [number, number] = [-view.rotate[0], -view.rotate[1]];
  const facing = (p: [number, number]) => geoDistance(p, centre) < Math.PI / 2 - 0.12;

  // ---- what to highlight ----
  const selectedBrand = selected?.kind === "brand" ? data.brands.find((b) => b.slug === selected.slug) : undefined;
  const highlighted = new Set<string>(selected?.kind === "country" ? [selected.id] : (selectedBrand?.countryIds ?? []));

  const fillFor = (id: string) => {
    const c = data.countries[id];
    if (!c) return LAND;
    if (mode === "stages" && c.status !== "planned") return c.stageColor;
    return STATUS[c.status].color;
  };

  // ---- dragging, pinching, wheel ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; view: View; dist?: number; moved: boolean }>({ x: 0, y: 0, view: HOME, moved: false });

  const onPointerDown = (e: React.PointerEvent) => {
    stopFlight();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      view: viewRef.current,
      dist: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : undefined,
      moved: pts.length > 1,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const pts = [...pointers.current.values()];
    if (pts.length === 2 && g.dist) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      setView({ ...g.view, zoom: clampZoom(g.view.zoom * (dist / g.dist)) });
      return;
    }
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    g.moved = true;
    setHover(null);
    // One radian of turn per globe-radius of drag, so the land follows the finger.
    const k = 180 / Math.PI / Math.max(1, radius);
    setView({ zoom: g.view.zoom, rotate: [g.view.rotate[0] + dx * k, Math.max(-80, Math.min(80, g.view.rotate[1] - dy * k))] });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    // Lifting one finger of a pinch restarts the drag from where the other one is.
    const rest = [...pointers.current.values()][0];
    if (rest) gesture.current = { x: rest.x, y: rest.y, view: viewRef.current, moved: true };
  };
  const onWheel = (e: React.WheelEvent) => {
    stopFlight();
    setView((v) => ({ ...v, zoom: clampZoom(v.zoom * Math.exp(-e.deltaY * 0.0015)) }));
  };

  // ---- selecting ----
  const selectCountry = (id: string) => {
    const shape = SHAPE_BY_ID.get(id);
    if (!shape) return;
    setSelected({ kind: "country", id });
    flyTo(viewOn(shape.label, zoomForArea(shape.area)));
  };
  const selectBrand = (b: MapSearchBrand) => {
    const points = b.countryIds.map((id) => SHAPE_BY_ID.get(id)?.label).filter((p): p is [number, number] => Boolean(p));
    if (points.length === 0) return router.push(`/brands/${b.slug}`);
    if (points.length === 1) return selectCountry(b.countryIds[0]);
    const mid = geoCentroid({ type: "MultiPoint", coordinates: points }) as [number, number];
    const spread = Math.max(...points.map((p) => geoDistance(mid, p)));
    setSelected({ kind: "brand", slug: b.slug });
    flyTo(viewOn(mid, 0.8 / (spread + 0.08)));
  };
  const clickCountry = (id: string) => {
    if (gesture.current.moved) return;
    if (selected?.kind === "country" && selected.id === id) return;
    selectCountry(id);
  };

  // ---- search ----
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const suggestions: Suggestion[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const rank = (name: string) => (name.toLowerCase().startsWith(q) ? 0 : 1);
    const countries = SHAPES.filter((s) => s.name.toLowerCase().includes(q))
      .sort((a, b) => rank(a.name) - rank(b.name) || Number(!data.countries[a.id]) - Number(!data.countries[b.id]) || a.name.localeCompare(b.name))
      .slice(0, 5)
      .map<Suggestion>((s) => {
        const c = data.countries[s.id];
        return {
          key: `c-${s.id}`,
          label: s.name,
          detail: c ? (c.brands.length ? `${STATUS[c.status].label} · ${c.brands.length} brand${c.brands.length === 1 ? "" : "s"}` : `Planned · ${c.plan ?? ""}`) : "Country · no brand yet",
          color: c ? STATUS[c.status].color : LAND,
          pick: () => selectCountry(s.id),
        };
      });
    const brands = data.brands
      .filter((b) => b.name.toLowerCase().includes(q))
      .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
      .slice(0, 5)
      .map<Suggestion>((b) => ({ key: `b-${b.slug}`, label: b.name, detail: `Brand · ${b.stageName}`, color: b.stageColor, pick: () => selectBrand(b) }));
    return [...countries, ...brands].sort((a, b) => rank(a.label) - rank(b.label)).slice(0, 7);
    // selectCountry/selectBrand only read refs and data, so they don't need to be dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, data]);
  const pick = (s: Suggestion | undefined) => {
    if (!s) return;
    s.pick();
    setQuery(s.label);
    setSearchOpen(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  // ---- legend ----
  const usedStages = new Set(Object.values(data.countries).map((c) => c.stageName));
  const legend =
    mode === "status"
      ? (Object.keys(STATUS) as MapStatus[]).map((s) => ({ key: s, label: STATUS[s].label, color: STATUS[s].color }))
      : [...stages.filter((s) => usedStages.has(s.name)).map((s) => ({ key: s.id, label: s.name, color: s.color })), { key: "planned", label: "Planned", color: STATUS.planned.color }];

  const showLabels = view.zoom >= 2;
  const showAllNames = view.zoom >= 3.5;
  const hovered = hover ? SHAPE_BY_ID.get(hover.id) : undefined;

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-white select-none">
      <div ref={box} className="absolute inset-0">
        {size.w > 0 && (
          <svg
            width={size.w}
            height={size.h}
            className="block touch-none cursor-grab active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            <defs>
              <radialGradient id="atmosphere">
                <stop offset="88%" stopColor="#669eda" stopOpacity="0" />
                <stop offset="93%" stopColor="#669eda" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#669eda" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="shade" cx="38%" cy="32%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.06" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
              </radialGradient>
            </defs>
            <circle cx={cx} cy={cy} r={radius * 1.09} fill="url(#atmosphere)" />
            <path d={path({ type: "Sphere" }) ?? ""} fill={OCEAN} stroke="#1d1d20" strokeWidth={1} onClick={() => !gesture.current.moved && setSelected(null)} />
            <path d={path(GRATICULE) ?? ""} fill="none" stroke="#ffffff" strokeOpacity={0.05} strokeWidth={0.5} pointerEvents="none" />
            {SHAPES.map((s) => {
              const d = path(s.geo);
              if (!d) return null;
              const isOn = highlighted.has(s.id);
              return (
                <path
                  key={s.id}
                  d={d}
                  fill={fillFor(s.id)}
                  stroke={isOn ? "#ffffff" : hover?.id === s.id ? "#9a9aa0" : BORDER}
                  strokeWidth={isOn ? 1.6 : view.zoom >= 2 ? 0.8 : 0.5}
                  className="cursor-pointer transition-[fill] duration-300"
                  onClick={() => clickCountry(s.id)}
                  onPointerMove={(e) => e.pointerType === "mouse" && e.buttons === 0 && setHover({ x: e.clientX, y: e.clientY, id: s.id })}
                  onPointerLeave={() => setHover(null)}
                />
              );
            })}
            {/* Highlighted countries on top, so their white outline isn't covered by neighbours. */}
            {[...highlighted].map((id) => {
              const s = SHAPE_BY_ID.get(id);
              const d = s && path(s.geo);
              return d ? <path key={`on-${id}`} d={d} fill="none" stroke="#ffffff" strokeWidth={1.6} pointerEvents="none" /> : null;
            })}
            {/* Day-side shading reads as a globe from afar, but only muddies colours up close. */}
            <circle cx={cx} cy={cy} r={radius} fill="url(#shade)" opacity={Math.max(0, 1 - (view.zoom - 1) / 1.5)} pointerEvents="none" />
            {SHAPES.map((s) => {
              const ours = Boolean(data.countries[s.id]);
              const on = highlighted.has(s.id);
              // Other countries are named only once they are big enough on screen to hold a name.
              if (!on && !(showLabels && ours) && !(showAllNames && s.area * radius * radius > 2500)) return null;
              if (!facing(s.label)) return null;
              const at = projection(s.label);
              if (!at) return null;
              return (
                <text
                  key={`t-${s.id}`}
                  x={at[0]}
                  y={at[1]}
                  textAnchor="middle"
                  dy="0.35em"
                  fontSize={ours || on ? 11 : 10}
                  fontWeight={ours || on ? 600 : 400}
                  letterSpacing="0.04em"
                  fill={ours || on ? "#ffffff" : "#8b8b90"}
                  stroke="#000000"
                  strokeOpacity={0.7}
                  strokeWidth={3}
                  strokeLinejoin="round"
                  style={{ paintOrder: "stroke" }}
                  pointerEvents="none"
                >
                  {s.name}
                </text>
              );
            })}
          </svg>
        )}
      </div>

      {/* Top-left: view switch and legend */}
      <div className="absolute top-4 right-[72px] left-4 sm:right-auto">
        <div className="rounded-xl bg-[#1f1f20]/95 p-2 shadow-lg backdrop-blur sm:flex sm:items-center sm:gap-4">
          <div className="flex rounded-lg bg-[#3f3f40] p-0.5 text-[13px] font-semibold">
            {(["status", "stages"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn("flex-1 rounded-md px-4 py-1.5 transition-colors sm:flex-none", mode === m ? "bg-[#656566] text-white" : "text-[#d4d4d6] hover:text-white")}
              >
                {m === "status" ? "Status" : "Stages"}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-3 px-1 sm:mt-0 sm:px-0">
            <div className="flex flex-1 flex-wrap gap-x-4 gap-y-1.5">
              {legend.map((l) => (
                <span key={l.key} className="inline-flex items-center gap-2 text-xs text-[#e4e4e6]">
                  <span className="size-4 rounded-[3px]" style={{ backgroundColor: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
            <button type="button" aria-label="Totals" onClick={() => setShowStats((v) => !v)} className={cn("ml-2 shrink-0 rounded-full p-0.5 text-[#a1a1a6] hover:text-white", showStats && "text-white")}>
              <InfoIcon className="size-4" />
            </button>
          </div>
        </div>
        {showStats && (
          <div className="mt-2 grid w-full grid-cols-4 gap-px overflow-hidden rounded-xl bg-[#2a2a2c] text-center shadow-lg sm:w-[420px]">
            {[
              { n: `${data.stats.brands}`, of: `/${data.stats.goal}`, l: "Brands" },
              { n: `${data.stats.countries}`, l: "Countries" },
              { n: `${data.stats.live}`, l: "Live" },
              { n: `${data.stats.planned}`, l: "Planned" },
            ].map((s) => (
              <div key={s.l} className="bg-[#1f1f20]/95 px-2 py-2.5">
                <div className="text-lg font-semibold tabular-nums">
                  {s.n}
                  {s.of && <span className="text-xs font-normal text-[#8b8b90]">{s.of}</span>}
                </div>
                <div className="text-[11px] tracking-wide text-[#a1a1a6] uppercase">{s.l}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top-right: menu */}
      <div className="absolute top-4 right-4">
        <button
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((v) => !v)}
          className="flex size-10 items-center justify-center rounded-full bg-[#1f1f20]/95 shadow-lg hover:bg-[#2c2c2e]"
        >
          {menuOpen ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
        </button>
        {menuOpen && (
          <nav className="absolute top-12 right-0 w-56 overflow-hidden rounded-xl bg-[#1f1f20]/95 py-1.5 text-sm shadow-xl backdrop-blur">
            {NAV.filter((n) => n.href !== "/").map((n) => (
              <Link key={n.href} href={n.href} className="flex items-center gap-3 px-4 py-2 text-[#e4e4e6] hover:bg-white/10 hover:text-white">
                <n.icon className="size-4 text-[#8b8b90]" />
                {n.label}
              </Link>
            ))}
            <div className="mt-1.5 flex items-center justify-between border-t border-white/10 px-4 pt-2.5 pb-1">
              <span className="truncate text-xs text-[#a1a1a6]">{actorName}</span>
              <form action={signOut}>
                <button type="submit" className="flex items-center gap-1.5 text-xs text-[#a1a1a6] hover:text-white">
                  <LogOutIcon className="size-3.5" /> Sign out
                </button>
              </form>
            </div>
          </nav>
        )}
      </div>

      {/* Country or brand card */}
      {selected && (
        <InfoCard
          country={selected.kind === "country" ? data.countries[selected.id] : undefined}
          countryName={selected.kind === "country" ? (SHAPE_BY_ID.get(selected.id)?.name ?? "") : ""}
          brand={selectedBrand}
          countryNames={(selectedBrand?.countryIds ?? []).map((id) => ({ id, name: SHAPE_BY_ID.get(id)?.name ?? id }))}
          onCountry={selectCountry}
          onClose={() => setSelected(null)}
          showStats={showStats}
        />
      )}

      {/* Zoom controls */}
      <div className="absolute right-4 bottom-[168px] hidden flex-col overflow-hidden rounded-lg bg-[#1f1f20]/95 shadow-lg sm:bottom-10 sm:flex">
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.5)} className="p-2.5 hover:bg-white/10">
          <PlusIcon className="size-4" />
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.5)} className="border-t border-white/10 p-2.5 hover:bg-white/10">
          <MinusIcon className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Reset view"
          onClick={() => {
            setSelected(null);
            flyTo(HOME);
          }}
          className="border-t border-white/10 p-2.5 hover:bg-white/10"
        >
          <LocateFixedIcon className="size-4" />
        </button>
      </div>

      {/* Search */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          pick(suggestions[active] ?? suggestions[0]);
        }}
        className="absolute bottom-8 left-1/2 flex w-[calc(100%-32px)] max-w-[800px] -translate-x-1/2 flex-col gap-2 sm:bottom-10 sm:flex-row sm:gap-5"
      >
        <div className="relative flex-1">
          {searchOpen && suggestions.length > 0 && (
            <ul role="listbox" className="absolute right-0 bottom-full left-0 mb-2 overflow-hidden rounded-sm border border-[#3a3a3a] bg-[#141414] py-1 shadow-xl">
              {suggestions.map((s, i) => (
                <li key={s.key} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(s)}
                    className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left", i === active && "bg-white/10")}
                  >
                    <span className="size-3 shrink-0 rounded-[3px]" style={{ backgroundColor: s.color }} />
                    <span className="flex-1 truncate text-[15px]">{s.label}</span>
                    <span className="truncate text-xs text-[#a1a1a6]">{s.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setSearchOpen(false)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(suggestions.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === "Escape") setSearchOpen(false);
            }}
            placeholder="Country or brand"
            aria-label="Search for a country or brand"
            className="h-14 w-full rounded-sm border border-[#3a3a3a] bg-[#141414]/95 px-4 text-[16px] text-white placeholder:text-[#8b8b90] focus:border-[#8b8b90] focus:outline-none"
          />
        </div>
        <button type="submit" className="h-12 rounded-sm bg-[#efefef] px-9 text-[15px] font-semibold text-black hover:bg-white sm:h-14">
          Explore
        </button>
      </form>

      <div className="pointer-events-none absolute bottom-3 left-4 hidden text-[11px] font-semibold tracking-[0.3em] text-white/50 uppercase lg:block">Build Tracker</div>

      {hover && hovered && (
        <div className="pointer-events-none fixed z-50 rounded-md bg-[#1f1f20]/95 px-3 py-2 text-xs shadow-xl" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <div className="text-sm font-semibold">{hovered.name}</div>
          <HoverDetail country={data.countries[hover.id]} />
        </div>
      )}
    </div>
  );
}

function HoverDetail({ country }: { country?: MapCountry }) {
  if (!country) return <div className="text-[#a1a1a6]">No brand yet</div>;
  return (
    <div className="mt-0.5 space-y-0.5 text-[#c8c8cc]">
      {country.brands.map((b) => (
        <div key={b.slug} className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ backgroundColor: b.stageColor }} />
          {b.name} · {b.stageName}
        </div>
      ))}
      {country.plan && <div className="text-[#a1a1a6]">On the plan · {country.plan}</div>}
    </div>
  );
}

function InfoCard({
  country,
  countryName,
  brand,
  countryNames,
  onCountry,
  onClose,
  showStats,
}: {
  country?: MapCountry;
  countryName: string;
  brand?: MapSearchBrand;
  countryNames: { id: string; name: string }[];
  onCountry: (id: string) => void;
  onClose: () => void;
  showStats: boolean;
}) {
  const title = brand ? brand.name : countryName;
  return (
    <div
      className={cn(
        "absolute right-4 left-4 max-h-[42vh] overflow-y-auto rounded-xl bg-[#1f1f20]/95 p-5 shadow-xl backdrop-blur sm:right-auto sm:max-h-[calc(100vh-260px)] sm:w-[360px]",
        showStats ? "top-[200px] sm:top-[150px]" : "top-[124px] sm:top-[84px]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] tracking-[0.2em] text-[#a1a1a6] uppercase">{brand ? "Region brand" : "Country"}</div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h2>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1 text-[#a1a1a6] hover:bg-white/10 hover:text-white">
          <XIcon className="size-4" />
        </button>
      </div>

      {brand ? (
        <>
          <div className="mt-3 flex items-center gap-2 text-sm text-[#c8c8cc]">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: brand.stageColor }} />
            {brand.stageName}
          </div>
          <div className="mt-4 text-[11px] tracking-[0.2em] text-[#a1a1a6] uppercase">Markets</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {countryNames.map((c) => (
              <button key={c.id} type="button" onClick={() => onCountry(c.id)} className="rounded-full bg-white/8 px-2.5 py-1 text-xs text-[#e4e4e6] hover:bg-white/15">
                {c.name}
              </button>
            ))}
          </div>
          <Link href={`/brands/${brand.slug}`} className="mt-5 flex h-11 items-center justify-center gap-1.5 rounded-sm bg-[#efefef] text-sm font-semibold text-black hover:bg-white">
            Open brand <ArrowUpRightIcon className="size-4" />
          </Link>
        </>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2 text-sm text-[#c8c8cc]">
            <span className="size-3 rounded-[3px]" style={{ backgroundColor: country ? STATUS[country.status].color : LAND }} />
            {country ? (country.brands.length ? STATUS[country.status].label : "Planned, no brand yet") : "No brand yet"}
          </div>
          {country?.plan && <div className="mt-1 text-sm text-[#a1a1a6]">On the plan · {country.plan}</div>}

          {country && country.brands.length > 0 && (
            <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
              {country.brands.map((b) => (
                <Link key={b.slug} href={`/brands/${b.slug}`} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 hover:bg-white/5">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: b.stageColor }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{b.name}</span>
                    <span className="block text-xs text-[#a1a1a6]">
                      {b.stageName}
                      {b.via === "region" && " · region brand"}
                    </span>
                  </span>
                  <ArrowUpRightIcon className="size-4 text-[#8b8b90]" />
                </Link>
              ))}
            </div>
          )}

          {(!country || country.brands.length === 0) && (
            <Link href="/countries#plan" className="mt-5 flex h-11 items-center justify-center gap-1.5 rounded-sm bg-[#efefef] text-sm font-semibold text-black hover:bg-white">
              {country?.plan ? "See the plan" : "Add to the plan"} <ArrowUpRightIcon className="size-4" />
            </Link>
          )}
        </>
      )}
    </div>
  );
}
