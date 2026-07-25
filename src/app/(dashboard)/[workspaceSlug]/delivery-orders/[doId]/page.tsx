import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getDeliveryOrderById } from "@/features/delivery-orders/queries";
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

  return <DeliveryOrderDetailView deliveryOrder={deliveryOrder} workspaceId={workspace.id} workspaceSlug={workspaceSlug} />;
}
