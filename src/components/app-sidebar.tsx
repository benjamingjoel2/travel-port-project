"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ColumnsIcon, GlobeIcon, LayoutDashboardIcon, MenuIcon, SettingsIcon, SparklesIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/pipeline", label: "Pipeline", icon: ColumnsIcon },
  { href: "/brands", label: "Brands", icon: GlobeIcon },
  { href: "/prompts", label: "Prompts", icon: SparklesIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function AppSidebar({ footer }: { footer: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-0.5 px-2">
      {NAV.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
              active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <item.icon className="size-4" />
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
      </div>
      {open && (
        <div className="border-b bg-sidebar py-2 md:hidden">
          {nav}
          <div className="mt-2 border-t px-2 pt-2">{footer}</div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-14 items-center px-4">
          <Brand />
        </div>
        {nav}
        <div className="mt-auto border-t p-2">{footer}</div>
      </aside>
    </>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold">
      <span className="flex size-6 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">BT</span>
      <span className="text-sm">Build Tracker</span>
    </Link>
  );
}
