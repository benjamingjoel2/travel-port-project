import { notFound } from "next/navigation";
import { getBrandBySlug } from "@/lib/data/brands";
import { getReferenceData } from "@/lib/data/reference";
import { updateBrand } from "@/lib/actions/brands";
import { PageHeader } from "@/components/page-header";
import { BrandForm } from "@/components/brand-form";

export default async function EditBrandPage({ params }: PageProps<"/brands/[slug]/edit">) {
  const { slug } = await params;
  const [brand, ref] = await Promise.all([getBrandBySlug(slug), getReferenceData()]);
  if (!brand) notFound();
  const action = updateBrand.bind(null, brand.id);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit ${brand.name}`} />
      <BrandForm brand={brand} stages={ref.stages} regions={ref.regions} members={ref.members} action={action} cancelHref={`/brands/${brand.slug}`} />
    </div>
  );
}
