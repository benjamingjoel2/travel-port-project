"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { geoBounds, geoMercator, geoPath } from "d3-geo";
import { ArrowUpRightIcon, LogOutIcon, MenuIcon, MinusIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import world from "@/data/world-110m.json";
import type { MapCountry, MapData, MapSearchBrand } from "@/lib/data/map";
import { PROGRESS, STEPS, brandStatus, hostOf } from "@/lib/progress";
import { mainPart, toShapes, type CountriesTopo, type Shape } from "@/lib/map-shapes";
import { NAV } from "@/components/app-sidebar";
import { signOut } from "@/app/login/actions";
import { cn } from "@/lib/utils";


// Coarse outlines ship with the page; finer ones (with small islands) load in the background for zooming in.
const COARSE = toShapes(world as unknown as CountriesTopo);
const DETAILED_URL = "/maps/countries-50m.json";
const DETAIL_ZOOM = 2.2;

// Starlink's map palette (Mapbox dark-v10 base, their availability colours and panels).
// Water and land a touch further apart than Mapbox dark-v10, and light borders on every country,
// so neighbours in the same colour stay easy to tell apart.
const WATER = "#141515";
const LAND = "#3b3a39";
const BORDER = "rgba(255, 255, 255, 0.22)";
const BORDER_ON_COLOUR = "rgba(255, 255, 255, 0.45)";
const PANEL = "rgba(39, 39, 40, 0.8)";
const LABEL = "rgba(255, 255, 255, 0.72)";
const STATUS = PROGRESS;

// The view is a Mapbox-style camera: centre longitude, centre in Mercator units, and zoom
// (at zoom 0 the world is 512 px wide).
type View = { lon: number; y: number; z: number };
type Box = { w: number; h: number };
type Pad = { top: number; right: number; bottom: number; left: number };
const MAX_ZOOM = 9;
const scaleOf = (z: number) => (512 * 2 ** z) / (2 * Math.PI);
const zoomOf = (s: number) => Math.log2((s * 2 * Math.PI) / 512);
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360));
const toRad = Math.PI / 180;

/** Keeps the world filling the screen side to side and the poles from coming into view. */
function clampView(v: View, { w, h }: Box): View {
  const z = Math.min(MAX_ZOOM, Math.max(zoomOf(w / (2 * Math.PI)), v.z));
  const s = scaleOf(z);
  const room = Math.PI - h / (2 * s);
  const y = room <= 0 ? 0 : Math.max(-room, Math.min(room, v.y));
  const lon = ((((v.lon + 180) % 360) + 360) % 360) - 180;
  return { lon, y, z };
}

/** The view that fits [west, south, east, north] inside the screen minus padding (Mapbox's fitBounds). */
function fitBounds([[west, south], [east, north]]: [[number, number], [number, number]], box: Box, pad: Pad, maxZoom = MAX_ZOOM): View {
  const span = east >= west ? east - west : east + 360 - west;
  const y1 = mercY(south);
  const y2 = mercY(north);
  const innerW = Math.max(40, box.w - pad.left - pad.right);
  const innerH = Math.max(40, box.h - pad.top - pad.bottom);
  const s = Math.min(innerW / (Math.max(span, 0.5) * toRad), innerH / Math.max(y2 - y1, 0.01));
  const z = Math.min(maxZoom, zoomOf(s));
  const sz = scaleOf(z);
  // Centre the bounds in the padded area, then work out the camera centre from that.
  const dx = pad.left + innerW / 2 - box.w / 2;
  const dy = pad.top + innerH / 2 - box.h / 2;
  return clampView({ lon: west + span / 2 - dx / sz / toRad, y: (y1 + y2) / 2 + dy / sz, z }, box);
}

/** Zoom by `dz` keeping the point under (px, py) still, the way Mapbox zooms toward the cursor. */
function zoomAt(v: View, dz: number, px: number, py: number, b: Box): View {
  const s = scaleOf(v.z);
  const lonAt = v.lon + (px - b.w / 2) / s / toRad;
  const yAt = v.y - (py - b.h / 2) / s;
  const z = Math.min(MAX_ZOOM, v.z + dz);
  const s2 = scaleOf(z);
  return clampView({ lon: lonAt - (px - b.w / 2) / s2 / toRad, y: yAt + (py - b.h / 2) / s2, z }, b);
}

function boundsOf(shapes: Shape[]): [[number, number], [number, number]] {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const s of shapes) {
    const [[w, so], [e, n]] = geoBounds(mainPart(s.geo));
    const e2 = e < w ? e + 360 : e;
    west = Math.min(west, w);
    east = Math.max(east, e2);
    south = Math.min(south, so);
    north = Math.max(north, n);
  }
  return [
    [west, south],
    [east > 180 ? east - 360 : east, north],
  ];
}

// Opens zoomed in on the Americas to Asia, centred on Europe and Africa where most brands are, so
// countries draw large; drag to reach Alaska, Japan or Australia. On a phone, Europe and Africa.
const START_WIDE: [[number, number], [number, number]] = [
  [-95, -38],
  [135, 68],
];
const START_NARROW: [[number, number], [number, number]] = [
  [-10, -35],
  [55, 60],
];
const NO_PAD: Pad = { top: 0, right: 0, bottom: 0, left: 0 };

type Selection = { kind: "country"; id: string } | { kind: "brand"; slug: string } | null;
type Suggestion = { key: string; label: string; detail: string; color: string; pick: () => void };

export function MapExplorer({ data, actorName }: { data: MapData; actorName: string }) {
  const router = useRouter();
  const frame = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box>({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const viewRef = useRef(view);
  const boxRef = useRef(box);
  const anim = useRef<number | null>(null);
  const [detailed, setDetailed] = useState<Shape[] | null>(null);
  const [selected, setSelected] = useState<Selection>(null);
  const [hover, setHover] = useState<{ x: number; y: number; id: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    viewRef.current = view;
    boxRef.current = box;
  }, [view, box]);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const next = { w: entry.contentRect.width, h: entry.contentRect.height };
      setBox(next);
      setView((v) => (v ? clampView(v, next) : fitBounds(next.w < 640 ? START_NARROW : START_WIDE, next, NO_PAD)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(DETAILED_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((topo) => !cancelled && topo && setDetailed(toShapes(topo as CountriesTopo)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function stopFlight() {
    if (anim.current !== null) cancelAnimationFrame(anim.current);
    anim.current = null;
  }
  useEffect(() => () => stopFlight(), []);

  function flyTo(target: View) {
    stopFlight();
    const from = viewRef.current;
    if (!from) return setView(target);
    const dLon = ((((target.lon - from.lon) % 360) + 540) % 360) - 180;
    let start: number | null = null;
    const step = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / 1200);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      setView(clampView({ lon: from.lon + dLon * e, y: from.y + (target.y - from.y) * e, z: from.z + (target.z - from.z) * e }, boxRef.current));
      anim.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    anim.current = requestAnimationFrame(step);
  }

  const zoomAround = (v: View, dz: number, px: number, py: number) => zoomAt(v, dz, px, py, boxRef.current);
  const zoomButton = (dz: number) => {
    const v = viewRef.current;
    const b = boxRef.current;
    if (v) flyTo(zoomAt(v, dz, b.w / 2, b.h / 2, b));
  };

  // Scroll, trackpad swipe and trackpad pinch all zoom the map. This listener can't be passive:
  // a trackpad pinch arrives as a wheel event with Ctrl held, and without preventDefault the
  // browser zooms the whole page instead of the map.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (anim.current !== null) cancelAnimationFrame(anim.current);
      anim.current = null;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const dz = Math.max(-1, Math.min(1, (-e.deltaY * unit) / (e.ctrlKey ? 100 : 220)));
      const rect = el.getBoundingClientRect();
      setView((v) => (v ? zoomAt(v, dz, e.clientX - rect.left, e.clientY - rect.top, boxRef.current) : v));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ---- projection ----
  const s = view ? scaleOf(view.z) : 1;
  const projection = useMemo(
    () =>
      view
        ? geoMercator()
            .rotate([-view.lon, 0])
            .scale(s)
            .translate([box.w / 2, box.h / 2 + s * view.y])
            .clipExtent([
              [-2, -2],
              [box.w + 2, box.h + 2],
            ])
            .precision(0.3)
        : null,
    [view, s, box.w, box.h],
  );
  const path = useMemo(() => (projection ? geoPath(projection) : null), [projection]);
  const shapes = detailed && view && view.z >= DETAIL_ZOOM ? detailed : COARSE;
  const shapeById = useMemo(() => new Map([...COARSE, ...(detailed ?? [])].map((x) => [x.id, x])), [detailed]);

  // ---- highlight ----
  const selectedBrand = selected?.kind === "brand" ? data.brands.find((b) => b.slug === selected.slug) : undefined;
  const highlighted = new Set<string>(selected?.kind === "country" ? [selected.id] : (selectedBrand?.countryIds ?? []));
  const fillFor = (id: string) => {
    const c = data.countries[id];
    if (!c) return LAND;
    return STATUS[c.status].color;
  };

  // ---- dragging, pinching, wheel ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; view: View | null; dist?: number; mid?: [number, number]; moved: boolean }>({ x: 0, y: 0, view: null, moved: false });

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
      mid: pts.length === 2 ? [(pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2] : undefined,
      moved: pts.length > 1,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g.view) return;
    const pts = [...pointers.current.values()];
    if (pts.length === 2 && g.dist && g.mid) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      setView(zoomAround(g.view, Math.log2(dist / g.dist), g.mid[0], g.mid[1]));
      return;
    }
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    g.moved = true;
    setHover(null);
    const sc = scaleOf(g.view.z);
    setView(clampView({ lon: g.view.lon - dx / sc / toRad, y: g.view.y + dy / sc, z: g.view.z }, boxRef.current));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    // Lifting one finger of a pinch carries on as a drag from the other one.
    const rest = [...pointers.current.values()][0];
    if (rest) gesture.current = { x: rest.x, y: rest.y, view: viewRef.current, moved: true };
  };
  const onDoubleClick = (e: React.MouseEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const rect = (e.currentTarget as Element).getBoundingClientRect();
    flyTo(zoomAround(v, e.shiftKey ? -1 : 1, e.clientX - rect.left, e.clientY - rect.top));
  };

  // ---- selecting ----
  const cardPad = (): Pad => {
    const b = boxRef.current;
    return b.w < 640 ? { top: Math.round(b.h * 0.45), right: 32, bottom: 60, left: 32 } : { top: 110, right: 90, bottom: 60, left: 420 };
  };
  const selectCountry = (id: string) => {
    const shape = shapeById.get(id);
    if (!shape) return;
    setSelected({ kind: "country", id });
    flyTo(fitBounds(boundsOf([shape]), boxRef.current, cardPad(), 5));
  };
  const selectBrand = (b: MapSearchBrand) => {
    const list = b.countryIds.map((id) => shapeById.get(id)).filter((x): x is Shape => Boolean(x));
    if (list.length === 0) return router.push(`/brands/${b.slug}`);
    if (list.length === 1) return selectCountry(list[0].id);
    setSelected({ kind: "brand", slug: b.slug });
    flyTo(fitBounds(boundsOf(list), boxRef.current, cardPad(), 5));
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
  const [searchShown, setSearchShown] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setSearchShown(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const suggestions: Suggestion[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const rank = (name: string) => (name.toLowerCase().startsWith(q) ? 0 : 1);
    const pool = detailed ?? COARSE;
    const countries = pool
      .filter((x) => x.name.toLowerCase().includes(q))
      .sort((a, b) => rank(a.name) - rank(b.name) || Number(!data.countries[a.id]) - Number(!data.countries[b.id]) || a.name.localeCompare(b.name))
      .slice(0, 5)
      .map<Suggestion>((x) => {
        const c = data.countries[x.id];
        return {
          key: `c-${x.id}`,
          label: x.name,
          detail: c ? `${STATUS[c.status].label}${c.brands.length ? ` · ${c.brands.length} brand${c.brands.length === 1 ? "" : "s"}` : c.plan ? ` · planned, ${c.plan}` : ""}` : "No brand yet",
          color: c ? STATUS[c.status].color : LAND,
          pick: () => selectCountry(x.id),
        };
      });
    const brands = data.brands
      .filter((b) => b.name.toLowerCase().includes(q))
      .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
      .slice(0, 5)
      .map<Suggestion>((b) => ({ key: `b-${b.slug}`, label: b.name, detail: `Brand · ${b.stageName}`, color: b.stageColor, pick: () => selectBrand(b) }));
    return [...countries, ...brands].sort((a, b) => rank(a.label) - rank(b.label)).slice(0, 7);
    // selectCountry/selectBrand only read refs, state setters and data, so they don't need to be dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, data, detailed]);
  const pick = (sg: Suggestion | undefined) => {
    if (!sg) return;
    sg.pick();
    setQuery(sg.label);
    setSearchOpen(false);
    setSearchShown(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const z = view?.z ?? 0;
  // Country names grow with zoom like Mapbox's, and appear once a country is big enough on screen to hold one.
  const labelSize = Math.min(16, Math.max(11, 10 + z * 1.2));
  const hovered = hover ? shapeById.get(hover.id) : undefined;

  return (
    <div className="fixed inset-0 overflow-hidden text-white select-none" style={{ backgroundColor: WATER, fontFamily: "Barlow, Roboto, Arial, sans-serif" }}>
      <div ref={frame} className="absolute inset-0">
        {path && projection && (
          <svg
            width={box.w}
            height={box.h}
            className="block touch-none cursor-grab active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={onDoubleClick}
            onClick={(e) => e.target === e.currentTarget && !gesture.current.moved && setSelected(null)}
          >
            {shapes.map((x) => {
              const d = path(x.geo);
              if (!d) return null;
              return (
                <path
                  key={x.id}
                  d={d}
                  fill={fillFor(x.id)}
                  stroke={data.countries[x.id] ? BORDER_ON_COLOUR : BORDER}
                  strokeWidth={Math.min(1.8, 0.8 + Math.max(0, z - 2) * 0.2)}
                  strokeLinejoin="round"
                  className="transition-[fill] duration-300"
                  onClick={() => clickCountry(x.id)}
                  onPointerMove={(e) => e.pointerType === "mouse" && e.buttons === 0 && setHover({ x: e.clientX, y: e.clientY, id: x.id })}
                  onPointerLeave={() => setHover(null)}
                />
              );
            })}
            {[...highlighted].map((id) => {
              const x = shapes.find((sh) => sh.id === id) ?? shapeById.get(id);
              const d = x && path(x.geo);
              return d ? <path key={`on-${id}`} d={d} fill="none" stroke="#ffffff" strokeWidth={1.5} strokeLinejoin="round" pointerEvents="none" /> : null;
            })}
            {shapes.map((x) => {
              if (x.area * s * s < 2200 && !highlighted.has(x.id)) return null;
              const at = projection(x.label);
              if (!at || at[0] < 0 || at[0] > box.w || at[1] < 0 || at[1] > box.h) return null;
              return (
                <text
                  key={`t-${x.id}`}
                  x={at[0]}
                  y={at[1]}
                  textAnchor="middle"
                  dy="0.35em"
                  fontSize={labelSize}
                  fill={highlighted.has(x.id) ? "#ffffff" : LABEL}
                  pointerEvents="none"
                >
                  {x.name}
                </text>
              );
            })}
          </svg>
        )}
      </div>

      {/* Top-left: the four steps to a live site, in order, with how many countries are at each */}
      <div className="absolute top-4 right-[116px] left-4">
        <div className="max-w-[600px] rounded-md px-3 pt-2.5 pb-3" style={{ backgroundColor: PANEL }}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-[11px] font-semibold tracking-[0.18em] text-white/60 uppercase">Build progress</span>
            <span className="text-xs text-white/60 tabular-nums">
              <span className="font-semibold text-white">{data.stats.brands}</span> of {data.stats.goal} brands · {data.stats.countries} countries
            </span>
          </div>
          <ol className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4 sm:gap-x-2">
            {STEPS.map((k, i) => (
              <li key={k}>
                <div className="h-1.5 rounded-full" style={{ backgroundColor: STATUS[k].color }} />
                <div className="mt-1.5 flex items-baseline justify-between gap-1">
                  <span className="text-[13px] font-semibold">
                    {i + 1}. {STATUS[k].label}
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums">{data.stats[k]}</span>
                </div>
                <div className="hidden text-[11px] leading-tight text-white/55 sm:block">{STATUS[k].long}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Top-right: search and menu (where Starlink has its close button) */}
      <div className="absolute top-4 right-4 flex items-start gap-2">
        <button
          type="button"
          aria-label={searchShown ? "Hide search" : "Search"}
          title="Search (press /)"
          onClick={() => setSearchShown((v) => !v)}
          className="flex size-10 items-center justify-center rounded-full hover:opacity-90"
          style={{ backgroundColor: searchShown ? "rgba(255, 255, 255, 0.2)" : PANEL }}
        >
          <SearchIcon className="size-[18px]" />
        </button>
        <div className="relative">
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex size-10 items-center justify-center rounded-full hover:opacity-90"
            style={{ backgroundColor: PANEL }}
          >
            {menuOpen ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </button>
          {menuOpen && (
            <nav className="absolute top-12 right-0 w-56 overflow-hidden rounded-md py-1.5 text-sm backdrop-blur" style={{ backgroundColor: "rgba(39, 39, 40, 0.92)" }}>
              {NAV.filter((n) => n.href !== "/").map((n) => (
                <Link key={n.href} href={n.href} className="flex items-center gap-3 px-4 py-2 text-white/85 hover:bg-white/10 hover:text-white">
                  <n.icon className="size-4 text-white/50" />
                  {n.label}
                </Link>
              ))}
              <div className="mt-1.5 flex items-center justify-between border-t border-white/10 px-4 pt-2.5 pb-1">
                <span className="truncate text-xs text-white/60">{actorName}</span>
                <form action={signOut}>
                  <button type="submit" className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white">
                    <LogOutIcon className="size-3.5" /> Sign out
                  </button>
                </form>
              </div>
            </nav>
          )}
        </div>
      </div>

      {selected && (
        <InfoCard
          country={selected.kind === "country" ? data.countries[selected.id] : undefined}
          countryName={selected.kind === "country" ? (shapeById.get(selected.id)?.name ?? "") : ""}
          brand={selectedBrand}
          countryNames={(selectedBrand?.countryIds ?? []).map((id) => ({ id, name: shapeById.get(id)?.name ?? id }))}
          onCountry={selectCountry}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Search stays hidden so the map has the whole screen; the magnifier (or /) brings it up. */}
      {searchShown && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            pick(suggestions[active] ?? suggestions[0]);
          }}
          className="absolute bottom-8 left-1/2 flex w-[calc(100%-64px)] max-w-[800px] -translate-x-1/2 flex-col gap-2 sm:bottom-10 sm:w-[calc(100%-64px)] sm:flex-row sm:gap-5"
        >
          <div className="relative flex-1">
            {searchOpen && suggestions.length > 0 && (
              <ul role="listbox" className="absolute right-0 bottom-full left-0 mb-2 overflow-hidden rounded-[2px] border border-[#3a3a3a] bg-[#141414] py-1">
                {suggestions.map((sg, i) => (
                  <li key={sg.key} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(sg)}
                      className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left", i === active && "bg-white/10")}
                    >
                      <span className="size-3 shrink-0 rounded-[2px]" style={{ backgroundColor: sg.color }} />
                      <span className="flex-1 truncate text-[15px]">{sg.label}</span>
                      <span className="truncate text-xs text-white/55">{sg.detail}</span>
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
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(suggestions.length - 1, i + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(0, i - 1));
                } else if (e.key === "Escape") {
                  setSearchOpen(false);
                  setSearchShown(false);
                }
              }}
              placeholder="Country or brand"
              aria-label="Search for a country or brand"
              className="h-14 w-full rounded-[2px] border border-[#3a3a3a] bg-[#141414] px-4 text-[16px] text-white placeholder:text-white/50 focus:border-white/60 focus:outline-none"
            />
          </div>
          <button type="submit" className="h-12 rounded-[2px] bg-[#efefef] px-9 text-[15px] font-semibold text-black hover:bg-white sm:h-14 sm:w-[140px] sm:px-0">
            Explore
          </button>
        </form>
      )}

      {/* Zoom buttons, like Mapbox's navigation control */}
      <div className="absolute right-4 bottom-10 flex flex-col overflow-hidden rounded-md" style={{ backgroundColor: PANEL }}>
        <button type="button" aria-label="Zoom in" onClick={() => zoomButton(1)} className="flex size-10 items-center justify-center hover:bg-white/10">
          <PlusIcon className="size-5" />
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomButton(-1)} className="flex size-10 items-center justify-center border-t border-white/15 hover:bg-white/10">
          <MinusIcon className="size-5" />
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-2.5 left-2 text-[13px] font-bold tracking-[0.2em] text-white/80 uppercase">Build Tracker</div>

      {hover && hovered && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-[3px] px-[7px] py-[5px] text-xs"
          style={{ left: hover.x, top: hover.y - 12, backgroundColor: PANEL }}
        >
          <div className="font-semibold">{hovered.name}</div>
          <HoverDetail country={data.countries[hover.id]} />
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent" style={{ borderTopColor: PANEL }} />
        </div>
      )}
    </div>
  );
}

function HoverDetail({ country }: { country?: MapCountry }) {
  if (!country) return <div className="text-white/60">No brand yet</div>;
  return (
    <div className="space-y-0.5 text-white/80">
      {country.brands.map((b) => (
        <div key={b.slug} className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px]" style={{ backgroundColor: STATUS[brandStatus(b.level)].color }} />
          {b.name} · {STATUS[brandStatus(b.level)].label}
          {b.url && <span className="text-white/50">· {hostOf(b.url)}</span>}
        </div>
      ))}
      {country.plan && <div className="text-white/60">On the plan · {country.plan}</div>}
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
}: {
  country?: MapCountry;
  countryName: string;
  brand?: MapSearchBrand;
  countryNames: { id: string; name: string }[];
  onCountry: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className={cn(
        "absolute right-4 left-4 max-h-[40vh] overflow-y-auto rounded-md p-4 sm:right-auto sm:max-h-[calc(100vh-280px)] sm:w-[360px]",
        "top-[150px] sm:top-[128px]",
      )}
      style={{ backgroundColor: PANEL }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] tracking-[0.18em] text-white/55 uppercase">{brand ? "Region brand" : "Country"}</div>
          <h2 className="mt-0.5 text-2xl font-semibold">{brand ? brand.name : countryName}</h2>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white">
          <XIcon className="size-4" />
        </button>
      </div>

      {brand ? (
        <>
          <div className="mt-2 flex items-center gap-2 text-sm text-white/80">
            <span className="size-3 rounded-[2px]" style={{ backgroundColor: STATUS[brandStatus(brand.level)].color }} />
            {STATUS[brandStatus(brand.level)].label} · {STATUS[brandStatus(brand.level)].long}
          </div>
          <div className="mt-4 text-[11px] tracking-[0.18em] text-white/55 uppercase">Markets</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {countryNames.map((c) => (
              <button key={c.id} type="button" onClick={() => onCountry(c.id)} className="rounded-[2px] bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20">
                {c.name}
              </button>
            ))}
          </div>
          <Link href={`/brands/${brand.slug}`} className="mt-4 flex h-11 items-center justify-center gap-1.5 rounded-[2px] bg-[#efefef] text-sm font-semibold text-black hover:bg-white">
            Open brand <ArrowUpRightIcon className="size-4" />
          </Link>
        </>
      ) : (
        <>
          <div className="mt-2 flex items-center gap-2 text-sm text-white/80">
            <span className="size-3 rounded-[2px]" style={{ backgroundColor: country ? STATUS[country.status].color : LAND }} />
            {country ? `${STATUS[country.status].label} · ${STATUS[country.status].long}` : "No brand yet"}
          </div>
          {country?.plan && <div className="mt-1 text-sm text-white/60">On the plan · {country.plan}</div>}

          {country && country.brands.length > 0 && (
            <div className="mt-3 divide-y divide-white/10 border-y border-white/10">
              {country.brands.map((b) => (
                <div key={b.slug} className="-mx-2 flex items-center gap-3 rounded-[2px] px-2 py-2.5 hover:bg-white/5">
                  <span className="size-3 shrink-0 rounded-[2px]" style={{ backgroundColor: STATUS[brandStatus(b.level)].color }} />
                  <Link href={`/brands/${b.slug}`} className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{b.name}</span>
                    <span className="block text-xs text-white/55">
                      {b.url && b.level !== "repo" ? hostOf(b.url) : STATUS[brandStatus(b.level)].label}
                      {b.via === "region" && " · region brand"}
                    </span>
                  </Link>
                  {b.url ? (
                    <a href={/^https?:\/\//.test(b.url) ? b.url : `https://${b.url}`} target="_blank" rel="noreferrer" className="shrink-0 rounded-[2px] bg-white/10 px-2 py-1 text-xs hover:bg-white/20">
                      {b.level === "repo" ? "Repo" : b.level === "live" ? "Site" : "Preview"} <ArrowUpRightIcon className="inline size-3" />
                    </a>
                  ) : (
                    <ArrowUpRightIcon className="size-4 text-white/45" />
                  )}
                </div>
              ))}
            </div>
          )}

          {(!country || country.brands.length === 0) && (
            <Link href="/countries#plan" className="mt-4 flex h-11 items-center justify-center gap-1.5 rounded-[2px] bg-[#efefef] text-sm font-semibold text-black hover:bg-white">
              {country?.plan ? "See the plan" : "Add to the plan"} <ArrowUpRightIcon className="size-4" />
            </Link>
          )}
        </>
      )}
    </div>
  );
}
