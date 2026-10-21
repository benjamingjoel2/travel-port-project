"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-fetches the current page's data every `intervalMs` while the tab is visible, so
 * brands found by auto-sync appear without a manual reload. Skips a tick while someone
 * is typing or a dialog is open, so it never disturbs an edit in progress.
 */
export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      const el = document.activeElement;
      const editing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement | null)?.isContentEditable;
      const dialogOpen = Boolean(document.querySelector("[role=dialog], [role=menu], [role=listbox]"));
      const dragging = Boolean(document.querySelector("[aria-pressed=true][aria-roledescription=draggable]"));
      if (editing || dialogOpen || dragging) return;
      router.refresh();
    };
    const id = window.setInterval(tick, intervalMs);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, router]);
  return null;
}
