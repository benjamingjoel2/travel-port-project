import type { DesignReference, Priority, WaitingOn, PhaseStatus, MemberRole } from "@/db/schema";

export const GOAL_BRAND_COUNT = 100;

/** Sentinel for "nothing selected" in dropdowns (Radix Select can't use an empty string). */
export const NONE_VALUE = "__none";

export const BUILD_PHASES: { number: number; name: string }[] = [
  { number: 1, name: "Layout, header, footer, design tokens" },
  { number: 2, name: "Homepage" },
  { number: 3, name: "Trip planner" },
  { number: 4, name: "Detail pages and blog" },
  { number: 5, name: "Polish, accessibility, SEO, Lighthouse" },
];

export const DEFAULT_STAGES: {
  key: string;
  name: string;
  color: string;
  countsAsLive?: boolean;
  requiresChecklist?: boolean;
  isTerminal?: boolean;
}[] = [
  { key: "idea", name: "Idea", color: "#9ca3af" },
  { key: "named", name: "Named", color: "#a78bfa" },
  { key: "prompt_ready", name: "Prompt ready", color: "#60a5fa" },
  { key: "building", name: "Building", color: "#fbbf24" },
  { key: "in_review", name: "In review", color: "#fb923c" },
  { key: "staging", name: "Staging", color: "#34d399" },
  { key: "live", name: "Live", color: "#10b981", countsAsLive: true, requiresChecklist: true },
  { key: "migrated", name: "Migrated to TravelPorts", color: "#0ea5e9", countsAsLive: true, requiresChecklist: true },
  { key: "paused", name: "Paused", color: "#d1d5db", isTerminal: true },
  { key: "dropped", name: "Dropped", color: "#f87171", isTerminal: true },
];

export const DEFAULT_REGIONS = ["Asia", "Latin America", "East Africa", "Southern Africa", "North Africa & Middle East", "Europe", "Oceania", "North America", "Caribbean"];

export const DEFAULT_CHECKLIST: { label: string; description?: string; required?: boolean; detailLabel?: string }[] = [
  { label: "Name checked: no tour company using it, trademark search done", detailLabel: "Registry searched (e.g. IMPI, KIPI, BRELA, DJKI)" },
  { label: "Domain bought, DNS connected, SSL live, primary domain set (www redirects)" },
  { label: "Instagram / social handles claimed" },
  { label: "WhatsApp Business number connected" },
  { label: "Email inbox set up" },
  { label: "All placeholder testimonials, stats and awards replaced with real ones (or removed)" },
  { label: "Real photos replace placeholders" },
  { label: "Prices and itineraries checked by a specialist" },
  { label: "Visa / entry info verified against official sources" },
  { label: "Required tour operator licence / registration for that country confirmed", detailLabel: "Licence / registration reference" },
  { label: "Analytics installed (unique ID per brand)", detailLabel: "Analytics ID" },
  { label: "Trip planner tested end to end (enquiry actually arrives)" },
  { label: "Mobile Lighthouse 90+", detailLabel: "Score" },
  { label: "Legal pages (privacy, terms, cookies) in place" },
];

export const PRIORITY_LABELS: Record<Priority, string> = { high: "High", medium: "Medium", low: "Low" };
export const DESIGN_REFERENCE_LABELS: Record<DesignReference, string> = { atlas: "Atlas (safari.com)", vita: "Vita", other: "Other" };
export const PHASE_STATUS_LABELS: Record<PhaseStatus, string> = { not_started: "Not started", in_progress: "In progress", done: "Done" };
export const WAITING_ON_LABELS: Record<WaitingOn, string> = { me: "Me", team: "Team", claude_code: "Claude Code", third_party: "Third party" };
export const ROLE_LABELS: Record<MemberRole, string> = { owner: "Owner", editor: "Editor", viewer: "Viewer" };

export const PRIORITIES = Object.keys(PRIORITY_LABELS) as Priority[];
export const DESIGN_REFERENCES = Object.keys(DESIGN_REFERENCE_LABELS) as DesignReference[];
export const PHASE_STATUSES = Object.keys(PHASE_STATUS_LABELS) as PhaseStatus[];
export const WAITING_ON_OPTIONS = Object.keys(WAITING_ON_LABELS) as WaitingOn[];
export const ROLES = Object.keys(ROLE_LABELS) as MemberRole[];
