"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ActivityIcon, ColumnsIcon, CompassIcon, FlagIcon, GlobeIcon, LayoutDashboardIcon, MapIcon, MenuIcon, SettingsIcon, SparklesIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const NAV = [
  { href: "/", label: "Map", icon: MapIcon },
  { href: "/overview", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/pipeline", label: "Pipeline", icon: ColumnsIcon },
  { href: "/brands", label: "Brands", icon: GlobeIcon },
  { href: "/countries", label: "Countries", icon: FlagIcon },
  { href: "/monitoring", label: "Monitoring", icon: ActivityIcon },
  { href: "/prompts", label: "Prompts", icon: SparklesIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function AppSidebar({ footer, bell }: { footer: React.ReactNode; bell?: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-0.5 px-3">
      {NAV.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-white/10 font-medium text-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-terra"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
            )}
          >
            <item.icon className={cn("size-4", active && "text-terra")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex h-12 items-center gap-2 border-b bg-sidebar px-3 md:hidden">
        <Button variant="ghost" size="icon-sm" onClick={() => setOpen((v) => !v)} aria-label="Toggle menu">
          {open ? <XIcon /> : <MenuIcon />}
        </Button>
        <Brand />
        <div className="ml-auto">{bell}</div>
      </div>
      {open && (
        <div className="border-b bg-sidebar py-2 md:hidden">
          {nav}
          <div className="mt-2 border-t px-2 pt-2">{footer}</div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-20 items-center justify-between pr-3 pl-5">
          <Brand />
          {bell}
        </div>
        {nav}
        <div className="mt-auto border-t p-3">{footer}</div>
      </aside>
    </>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <CompassIcon className="size-4.5" />
      </span>
      <span className="leading-tight">
        <span className="block text-[13px] font-bold tracking-[0.2em] uppercase">Build Tracker</span>
        <span className="block text-[11px] tracking-[0.12em] text-muted-foreground uppercase">Travel portfolio</span>
      </span>
    </Link>
  );
}
