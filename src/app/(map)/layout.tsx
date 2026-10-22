import { SYNC_INTERVAL_MS } from "@/lib/sync";
import { AutoRefresh } from "@/components/auto-refresh";
import { requireActor } from "@/lib/auth";

/** The home map is full-screen: no sidebar, just the globe and its own menu. */
export default async function MapLayout({ children }: LayoutProps<"/">) {
  await requireActor();
  return (
    <>
      <AutoRefresh intervalMs={SYNC_INTERVAL_MS} />
      {children}
    </>
  );
}
