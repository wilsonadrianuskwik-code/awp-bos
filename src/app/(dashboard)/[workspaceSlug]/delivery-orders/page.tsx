import { notFound } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getDeliveryOrders } from "@/features/delivery-orders/queries";
import { DeliveryOrderListPage } from "@/features/delivery-orders/components/delivery-order-list-page";

export default async function DeliveryOrdersRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const { deliveryOrders } = await getDeliveryOrders(workspace.id, { pageSize: 50 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Delivery Orders"
        description="Track outbound deliveries against invoices"
        action={
          <Button asChild>
            <Link href={`/${workspaceSlug}/delivery-orders/new`}>
              <Plus className="mr-2 h-4 w-4" />
              New Delivery Order
            </Link>
          </Button>
        }
      />
      <DeliveryOrderListPage deliveryOrders={deliveryOrders} workspaceSlug={workspaceSlug} />
    </div>
  );
}
