import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getStandaloneCatalogItems } from "@/features/catalog/queries";
import { CatalogForm } from "@/features/catalog/components/catalog-form";

export default async function NewCatalogItemPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const products = await getStandaloneCatalogItems(workspace.id);

  return (
    <div className="mx-auto max-w-2xl">
      <CatalogForm products={products} />
    </div>
  );
}
