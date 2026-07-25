"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { createDeliveryOrder } from "@/features/delivery-orders/actions";
import type { DeliveryOrderWithRelations } from "@/features/delivery-orders/types";

type InvoiceLineForDelivery = { id: string; description: string; quantity: number; unit: string | null };

// Embedded on the Invoice detail page — fulfillment is tracked primarily
// from the Invoice, per the architecture (master plan §5.4), while still
// allowing a Delivery Order to be created standalone elsewhere.
export function DeliveryOrdersSection({
  invoiceId,
  workspaceId,
  workspaceSlug,
  deliveryOrders,
  invoiceLineItems,
}: {
  invoiceId: string;
  workspaceId: string;
  workspaceSlug: string;
  deliveryOrders: DeliveryOrderWithRelations[];
  invoiceLineItems: InvoiceLineForDelivery[];
}) {
  const [orders, setOrders] = useState(deliveryOrders);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    startTransition(async () => {
      const result = await createDeliveryOrder(workspaceId, {
        invoice_id: invoiceId,
        line_items: invoiceLineItems.map((li) => ({
          description: li.description,
          quantity: li.quantity,
          unit: li.unit ?? undefined,
          source_line_item_id: li.id,
        })),
      });
      if (result.data) {
        window.location.reload();
      }
    });
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold">Delivery Orders</h3>
        <Button size="sm" variant="outline" disabled={isPending} onClick={handleCreate}>
          New Delivery Order
        </Button>
      </div>
      {orders.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">No delivery orders yet.</p>
      ) : (
        <>
          <ul className="mt-3 divide-y">
            {orders.map((doItem) => (
              <li key={doItem.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
                <Link
                  href={`/${workspaceSlug}/delivery-orders/${doItem.id}`}
                  className="font-mono hover:underline"
                >
                  {doItem.do_number}
                </Link>
                <span className="flex items-center gap-2">
                  {doItem.delivery_date && (
                    <span className="text-xs text-muted-foreground">
                      {doItem.delivery_date}
                    </span>
                  )}
                  <StatusBadge status={doItem.status} />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t pt-2.5 text-xs text-muted-foreground">
            Marking a delivery order delivered records its quantities against
            this invoice&apos;s fulfillment automatically.
          </p>
        </>
      )}
    </Card>
  );
}
