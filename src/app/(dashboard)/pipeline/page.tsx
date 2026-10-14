import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Pipeline" };

export default function PipelinePage() {
  return (
    <>
      <PageHeader title="Pipeline" description="Kanban board by stage." />
      <Card>
        <CardContent className="text-sm text-muted-foreground">The drag-and-drop board arrives in Phase 2. Until then, use the Brands table and change stages from each brand page.</CardContent>
      </Card>
    </>
  );
}
