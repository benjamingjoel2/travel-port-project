import { listBrands } from "@/lib/data/brands";
import { getStages } from "@/lib/data/reference";
import { canEdit, getActor } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { PipelineBoard } from "@/components/pipeline-board";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const [brands, stages, actor] = await Promise.all([listBrands(), getStages(), getActor()]);
  const editable = actor ? canEdit(actor.role) : false;
  return (
    <>
      <PageHeader title="Pipeline" description={editable ? "Drag a card to change its stage. Live needs the launch checklist complete." : "Drag-and-drop is available to editors."} />
      <PipelineBoard brands={brands} stages={stages} editable={editable} />
    </>
  );
}
