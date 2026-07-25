import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getAllSuppliers } from "@/features/suppliers/queries";
import { getProjects } from "@/features/projects/queries";
import { getLineItemTemplates } from "@/features/line-items/queries";
import { getActiveCatalogItems } from "@/features/catalog/queries";
import { PurchaseOrderBuilder } from "@/features/purchase-orders/components/purchase-order-builder";

export default async function NewPurchaseOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ supplierId?: string }>;
}) {
  const { workspaceSlug } = await params;
  const { supplierId } = await searchParams;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const [suppliers, { projects }, templates, catalogItems] = await Promise.all([
    getAllSuppliers(workspace.id),
    getProjects(workspace.id, { pageSize: 500 }),
    getLineItemTemplates(workspace.id),
    getActiveCatalogItems(workspace.id),
  ]);

  return (
    <PurchaseOrderBuilder
      suppliers={suppliers}
      projects={projects}
      templates={templates}
      catalogItems={catalogItems}
      initialSupplierId={supplierId}
    />
  );
}
