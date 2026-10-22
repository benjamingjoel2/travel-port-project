import { requireActor } from "@/lib/auth";
import { getMapData } from "@/lib/data/map";
import { getStages } from "@/lib/data/reference";
import { GlobeExplorer } from "@/components/globe-explorer";

export const metadata = { title: "Map" };

export default async function MapPage() {
  const [actor, data, stages] = await Promise.all([requireActor(), getMapData(), getStages()]);
  return <GlobeExplorer data={data} stages={stages.filter((s) => !s.isTerminal).map((s) => ({ id: s.id, name: s.name, color: s.color }))} actorName={actor.name} />;
}
