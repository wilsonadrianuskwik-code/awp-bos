import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getCatalogItem, getStandaloneCatalogItems } from "@/features/catalog/queries";
import { CatalogForm } from "@/features/catalog/components/catalog-form";

export default async function EditCatalogItemPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; itemId: string }>;
}) {
  const { workspaceSlug, itemId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const [item, products] = await Promise.all([
    getCatalogItem(itemId, workspace.id),
    getStandaloneCatalogItems(workspace.id),
  ]);
  if (!item) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <CatalogForm item={item} products={products} />
    </div>
  );
}
