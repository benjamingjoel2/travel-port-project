import { requireActor } from "@/lib/auth";
import { getMapData } from "@/lib/data/map";
import { MapExplorer } from "@/components/map-explorer";

export const metadata = { title: "Map" };

export default async function MapPage() {
  const [actor, data] = await Promise.all([requireActor(), getMapData()]);
  return <MapExplorer data={data} actorName={actor.name} />;
}
