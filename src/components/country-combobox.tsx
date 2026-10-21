"use client";

import { useId, useMemo, useState } from "react";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { COUNTRIES } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

/** Type-to-search country picker. Submits `countryCode` and `country` as hidden fields. */
export function CountryCombobox({ value, onChange, id }: { value: string; onChange: (code: string, name: string) => void; id?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listId = useId();
  const selected = COUNTRIES.find((c) => c.code === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q);
  }, [query]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          className={cn(
            "flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30",
            !selected && "text-muted-foreground",
          )}
        >
          <span className="truncate">{selected ? selected.name : "Type to search countries"}</span>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64">
        <div className="border-b p-2">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-8"
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered[0]) {
                e.preventDefault();
                onChange(filtered[0].code, filtered[0].name);
                setOpen(false);
              }
            }}
          />
        </div>
        <ul id={listId} role="listbox" className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 && <li className="px-2 py-4 text-center text-sm text-muted-foreground">No match</li>}
          {filtered.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                role="option"
                aria-selected={c.code === value}
                onClick={() => {
                  onChange(c.code, c.name);
                  setOpen(false);
                }}
                className={cn("flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent", c.code === value && "font-medium")}
              >
                <CheckIcon className={cn("size-4", c.code === value ? "opacity-100" : "opacity-0")} />
                {c.name}
                <span className="ml-auto text-xs text-muted-foreground">{c.code}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
      <input type="hidden" name="countryCode" value={value} />
      <input type="hidden" name="country" value={selected?.name ?? ""} />
    </Popover>
  );
}
