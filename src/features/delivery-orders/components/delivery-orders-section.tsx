"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { createDeliveryOrder } from "@/features/delivery-orders/actions";
import { DeliveryProgress } from "@/features/delivery-orders/components/delivery-progress";
import type { DeliveryOrderWithRelations } from "@/features/delivery-orders/types";
import type { FulfillmentItemWithProgress } from "@/features/fulfillment/types";

type InvoiceLineForDelivery = {
  id: string;
  description: string;
  quantity: number;
  unit: string | null;
};

/**
 * The single delivery surface on the Invoice detail page: what has been
 * delivered per line, and the Delivery Orders that delivered it.
 *
 * These used to be two separate cards — a Fulfillment tracker and a
 * Delivery Orders list — showing the same fact from two angles. 00081
 * already made Delivery Orders the source of truth (marking one
 * delivered writes the fulfillment events), so the progress read here is
 * the roll-up of the orders listed below it, not a second thing to keep
 * in sync by hand.
 */
export function DeliveryOrdersSection({
  invoiceId,
  workspaceId,
  workspaceSlug,
  deliveryOrders,
  invoiceLineItems,
  progressByLine = [],
}: {
  invoiceId: string;
  workspaceId: string;
  workspaceSlug: string;
  deliveryOrders: DeliveryOrderWithRelations[];
  invoiceLineItems: InvoiceLineForDelivery[];
  /** Delivered/remaining per invoice line, rolled up from delivered DOs. */
  progressByLine?: FulfillmentItemWithProgress[];
}) {
  const [orders] = useState(deliveryOrders);
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {orders.length === 0
            ? "Nothing delivered yet."
            : `${orders.length} delivery order${orders.length === 1 ? "" : "s"}`}
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={handleCreate}
        >
          New Delivery Order
        </Button>
      </div>

      {progressByLine.length > 0 && (
        <div className="space-y-3">
          {progressByLine.map((line) => (
            <div key={line.id} className="rounded-lg border p-3">
              <p className="truncate text-sm font-medium">{line.description}</p>
              <div className="mt-2">
                <DeliveryProgress
                  ordered={line.purchased}
                  delivered={line.delivered}
                  remaining={line.remaining}
                  progressPercent={line.progress_percent}
                  isOverDelivered={line.is_over_delivered}
                  unitLabel={line.unit}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {orders.length > 0 && (
        <ul className="divide-y border-t">
          {orders.map((doItem) => (
            <li
              key={doItem.id}
              className="flex items-center justify-between gap-2 py-2 text-[13px]"
            >
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
      )}
    </div>
  );
}
