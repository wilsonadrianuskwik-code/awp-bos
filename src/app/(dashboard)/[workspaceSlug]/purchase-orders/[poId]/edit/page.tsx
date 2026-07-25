import { notFound, redirect } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getAllSuppliers } from "@/features/suppliers/queries";
import { getProjects } from "@/features/projects/queries";
import { getPurchaseOrderById } from "@/features/purchase-orders/queries";
import { getLineItemTemplates } from "@/features/line-items/queries";
import { getActiveCatalogItems } from "@/features/catalog/queries";
import { PurchaseOrderBuilder } from "@/features/purchase-orders/components/purchase-order-builder";

export default async function EditPurchaseOrderPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; poId: string }>;
}) {
  const { workspaceSlug, poId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const purchaseOrder = await getPurchaseOrderById(poId, workspace.id);
  if (!purchaseOrder) notFound();

  if (purchaseOrder.status !== "draft") {
    redirect(`/${workspaceSlug}/purchase-orders/${poId}`);
  }

  const [suppliers, { projects }, templates, catalogItems] = await Promise.all([
    getAllSuppliers(workspace.id),
    getProjects(workspace.id, { pageSize: 500 }),
    getLineItemTemplates(workspace.id),
    getActiveCatalogItems(workspace.id),
  ]);

  return (
    <PurchaseOrderBuilder
      purchaseOrder={purchaseOrder}
      suppliers={suppliers}
      projects={projects}
      templates={templates}
      catalogItems={catalogItems}
    />
  );
}
