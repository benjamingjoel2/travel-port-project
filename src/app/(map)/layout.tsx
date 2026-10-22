import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import { SYNC_INTERVAL_MS } from "@/lib/sync";
import { AutoRefresh } from "@/components/auto-refresh";
import { requireActor } from "@/lib/auth";

/** The home map is full-screen: no sidebar, just the map and its own menu. Barlow stands in for Starlink's DIN. */
export default async function MapLayout({ children }: LayoutProps<"/">) {
  await requireActor();
  return (
    <>
      <AutoRefresh intervalMs={SYNC_INTERVAL_MS} />
      {children}
    </>
  );
}
