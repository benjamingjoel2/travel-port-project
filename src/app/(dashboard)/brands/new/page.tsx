import { getReferenceData } from "@/lib/data/reference";
import { createBrand } from "@/lib/actions/brands";
import { PageHeader } from "@/components/page-header";
import { BrandForm } from "@/components/brand-form";

export const metadata = { title: "New brand" };

export default async function NewBrandPage() {
  const ref = await getReferenceData();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New brand" description="Phases and the launch checklist are created automatically." />
      <BrandForm stages={ref.stages} regions={ref.regions} members={ref.members} action={createBrand} cancelHref="/brands" />
    </div>
  );
}
