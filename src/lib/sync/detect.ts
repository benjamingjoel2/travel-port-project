import { COUNTRIES } from "@/lib/countries";

/** "Côte d’Ivoire" → "cote d ivoire", "south-africa" → "south africa". */
export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** "dzong-house" → "Dzong House", "Escale-Voyages" → "Escale Voyages". */
export function humanize(slug: string): string {
  return slug
    .replace(/\.+$/, "")
    .split(/[-_\s.]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const ALIASES: Record<string, string> = {
  usa: "US",
  "united states of america": "US",
  uk: "GB",
  "great britain": "GB",
  england: "GB",
  scotland: "GB",
  uae: "AE",
  emirates: "AE",
  drc: "CD",
  "democratic republic of the congo": "CD",
  "ivory coast": "CI",
  "cote d ivoire": "CI",
  burma: "MM",
  "czech republic": "CZ",
  bosnia: "BA",
  "sao tome": "ST",
  "cape verde": "CV",
  swaziland: "SZ",
  "east timor": "TL",
  holland: "NL",
  "benin republic": "BJ",
  "republic of benin": "BJ",
  "south korea": "KR",
  "north korea": "KP",
};

/** Normalised name → ISO code, longest names first so "south africa" wins over "africa"-like overlaps. */
const NAME_TO_CODE: [string, string][] = (() => {
  const m = new Map<string, string>();
  for (const c of COUNTRIES) {
    const n = normalize(c.name);
    if (n.length >= 3) m.set(n, c.code);
  }
  for (const [k, v] of Object.entries(ALIASES)) m.set(k, v);
  return [...m.entries()].sort((a, b) => b[0].length - a[0].length);
})();

const EXACT = new Map(NAME_TO_CODE);

/** Strict: the whole repo or project name must be a country ("costa-rica", "south_africa"). */
export function detectCountryFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  return EXACT.get(normalize(name)) ?? null;
}

/**
 * Loose: count country mentions in free text (README, CLAUDE.md). Returns a code only when
 * one country clearly dominates (≥5 mentions and ≥3× the runner-up), so multi-country
 * brands stay unassigned instead of being guessed.
 */
export function detectCountryFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  let t = ` ${normalize(text.slice(0, 200_000))} `;
  const counts = new Map<string, number>();
  for (const [name, code] of NAME_TO_CODE) {
    // Lookahead keeps the trailing space so back-to-back mentions all match.
    const re = new RegExp(` ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?= )`, "g");
    const n = t.match(re)?.length ?? 0;
    if (n > 0) {
      counts.set(code, (counts.get(code) ?? 0) + n);
      // Blank out matches so "guinea" isn't also counted inside "papua new guinea".
      t = t.replace(re, " ");
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;
  const [top, second] = ranked;
  if (top[1] < 5) return null;
  if (second && top[1] < second[1] * 3) return null;
  return top[0];
}
