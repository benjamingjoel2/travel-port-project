import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Prompts" };

export default function PromptsPage() {
  return (
    <>
      <PageHeader title="Prompts" description="Templates and the prompt generator." />
      <Card>
        <CardContent className="text-sm text-muted-foreground">Prompt templates, the generator form and version diffs arrive in Phase 4.</CardContent>
      </Card>
    </>
  );
}
