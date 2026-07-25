"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DetailHeader } from "@/components/shared/detail-header";
import { FieldList, DetailItem } from "@/components/shared/detail-item";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateDeliveryOrderStatus } from "@/features/delivery-orders/actions";
import { DELIVERY_ORDER_STATUSES, type DeliveryOrderDetail } from "@/features/delivery-orders/types";

const NEXT_STATUS: Record<string, string | null> = {
  draft: "prepared",
  prepared: "dispatched",
  dispatched: "delivered",
  delivered: null,
  cancelled: null,
};

export function DeliveryOrderDetailView({
  deliveryOrder,
  workspaceId,
  workspaceSlug,
}: {
  deliveryOrder: DeliveryOrderDetail;
  workspaceId: string;
  workspaceSlug: string;
}) {
  const [status, setStatus] = useState(deliveryOrder.status);
  const [receivedBy, setReceivedBy] = useState(deliveryOrder.received_by ?? "");
  const [isPending, startTransition] = useTransition();

  const next = NEXT_STATUS[status];

  function handleAdvance() {
    if (!next) return;
    startTransition(async () => {
      const result = await updateDeliveryOrderStatus(
        workspaceId,
        deliveryOrder.id,
        next as (typeof DELIVERY_ORDER_STATUSES)[number],
        next === "delivered" ? receivedBy : undefined
      );
      if (!result.error) setStatus(next as typeof status);
    });
  }

  return (
    <div className="space-y-6">
      <DetailHeader
        title={deliveryOrder.do_number}
        backHref={`/${workspaceSlug}/delivery-orders`}
        backLabel="Delivery Orders"
        badges={<StatusBadge status={status} />}
        subtitle={deliveryOrder.client?.name ?? undefined}
        actions={
          next && (
            <div className="flex items-center gap-2">
              {next === "delivered" && (
                <Input
                  placeholder="Received by"
                  value={receivedBy}
                  onChange={(e) => setReceivedBy(e.target.value)}
                  className="w-40"
                />
              )}
              <Button size="sm" disabled={isPending} onClick={handleAdvance}>
                Mark as {next}
              </Button>
            </div>
          )
        }
      />

      <Card className="p-4">
        <FieldList>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Invoice</dt>
            <dd className="mt-1 text-sm">
              {deliveryOrder.invoice ? (
                <Link href={`/${workspaceSlug}/invoices/${deliveryOrder.invoice.id}`} className="hover:underline">
                  {deliveryOrder.invoice.invoice_number}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <DetailItem label="Client" value={deliveryOrder.client?.name} />
          <DetailItem label="Delivery Date" value={deliveryOrder.delivery_date} />
          <DetailItem label="Received By" value={deliveryOrder.received_by} />
          <DetailItem label="Notes" value={deliveryOrder.notes} />
        </FieldList>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-[15px] font-semibold">Items</h3>
        <ul className="divide-y">
          {deliveryOrder.line_items.map((item) => (
            <li key={item.id} className="flex items-center justify-between py-2 text-[13px]">
              <span>{item.description}</span>
              <span className="tabular-nums text-muted-foreground">
                {item.quantity} {item.unit ?? ""}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
