import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getStandaloneCatalogItems } from "@/features/catalog/queries";
import { getItemCategories, getSimpleLookups } from "@/features/master-data/queries";
import { CatalogForm } from "@/features/catalog/components/catalog-form";

export default async function NewCatalogItemPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const [products, categories, unitsOfMeasure] = await Promise.all([
    getStandaloneCatalogItems(workspace.id),
    getItemCategories(workspace.id),
    getSimpleLookups(workspace.id, "unit_of_measure"),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <CatalogForm
        products={products}
        categories={categories}
        unitsOfMeasure={unitsOfMeasure}
      />
    </div>
  );
}
