import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import {
  getDeliveryOrderActivities,
  getDeliveryOrderById,
} from "@/features/delivery-orders/queries";
import { DeliveryOrderDetailView } from "@/features/delivery-orders/components/delivery-order-detail";

export default async function DeliveryOrderDetailRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string; doId: string }>;
}) {
  const { workspaceSlug, doId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const deliveryOrder = await getDeliveryOrderById(workspace.id, doId);
  if (!deliveryOrder) notFound();

  const activities = await getDeliveryOrderActivities(doId);

  return (
    <DeliveryOrderDetailView
      deliveryOrder={deliveryOrder}
      activities={activities}
      workspaceId={workspace.id}
      workspaceSlug={workspaceSlug}
      workspaceName={workspace.name}
      logoUrl={workspace.logo_url}
      companyProfile={workspace.settings?.company_profile}
      branding={workspace.settings?.branding}
    />
  );
}
