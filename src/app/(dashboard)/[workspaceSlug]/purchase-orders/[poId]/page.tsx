import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import {
  getPurchaseOrderById,
  getPurchaseOrderActivities,
  getPurchaseOrderRelationships,
} from "@/features/purchase-orders/queries";
import { PurchaseOrderDetail } from "@/features/purchase-orders/components/purchase-order-detail";

export default async function PurchaseOrderDetailRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string; poId: string }>;
}) {
  const { workspaceSlug, poId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const [purchaseOrder, activities, relationships] = await Promise.all([
    getPurchaseOrderById(poId, workspace.id),
    getPurchaseOrderActivities(poId),
    getPurchaseOrderRelationships(workspace.id, poId),
  ]);

  if (!purchaseOrder) notFound();

  return (
    <PurchaseOrderDetail
      purchaseOrder={purchaseOrder}
      activities={activities}
      relationships={relationships}
      workspaceName={workspace.name}
      logoUrl={workspace.logo_url}
      companyProfile={workspace.settings?.company_profile}
      branding={workspace.settings?.branding}
    />
  );
}
