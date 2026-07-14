"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { createFulfillmentItemAction } from "@/features/fulfillment/actions";
import { FulfillmentProgress } from "@/features/fulfillment/components/fulfillment-progress";
import { RecordDeliveryDialog } from "@/features/fulfillment/components/record-delivery-dialog";
import { FULFILLMENT_ELIGIBLE_INVOICE_STATUSES } from "@/features/fulfillment/types";
import type { FulfillmentItemWithProgress } from "@/features/fulfillment/types";

type EligibleLineItem = {
  id: string;
  description: string;
  quantity: number;
  unit: string | null;
};

type InvoiceFulfillmentSectionProps = {
  invoiceStatus: string;
  lineItems: EligibleLineItem[];
  fulfillmentItems: FulfillmentItemWithProgress[];
};

// Read-only from the Invoice feature's side: this section only reads
// invoice status/line items already fetched by the invoice detail page and
// a separately-fetched fulfillment_items list scoped to this invoice — it
// never writes to invoices/line_items, and the invoice detail page needs
// zero new RPC/action of its own to support it.
export function InvoiceFulfillmentSection({
  invoiceStatus,
  lineItems,
  fulfillmentItems,
}: InvoiceFulfillmentSectionProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [recordingId, setRecordingId] = useState<string | null>(null);

  const trackedLineItemIds = new Set(fulfillmentItems.map((fi) => fi.line_item_id));
  const isEligibleStatus = FULFILLMENT_ELIGIBLE_INVOICE_STATUSES.includes(
    invoiceStatus as (typeof FULFILLMENT_ELIGIBLE_INVOICE_STATUSES)[number]
  );
  const untrackedLineItems = isEligibleStatus
    ? lineItems.filter((li) => !trackedLineItemIds.has(li.id))
    : [];

  const recordingItem = fulfillmentItems.find((fi) => fi.id === recordingId) ?? null;

  function handleTrack(lineItemId: string) {
    startTransition(async () => {
      const result = await createFulfillmentItemAction(workspace.id, lineItemId);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Fulfillment tracking started", "success");
      router.refresh();
    });
  }

  if (fulfillmentItems.length === 0 && untrackedLineItems.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No fulfillment tracking for this invoice.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {fulfillmentItems.map((item) => (
        <div key={item.id} className="rounded-lg border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Link
                  href={`/${workspace.slug}/fulfillment/${item.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {item.description}
                </Link>
                <StatusBadge status={item.status} />
              </div>
              <FulfillmentProgress
                purchased={item.purchased}
                delivered={item.delivered}
                remaining={item.remaining}
                progressPercent={item.progress_percent}
                isOverDelivered={item.is_over_delivered}
                unitLabel={item.unit}
              />
            </div>
            {item.status !== "completed" && item.status !== "cancelled" && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setRecordingId(item.id)}
              >
                Record Delivery
              </Button>
            )}
          </div>
        </div>
      ))}

      {untrackedLineItems.map((li) => (
        <div
          key={li.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3"
        >
          <span className="min-w-0 truncate text-sm">{li.description}</span>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={isPending}
            onClick={() => handleTrack(li.id)}
          >
            Track Fulfillment
          </Button>
        </div>
      ))}

      {recordingItem && (
        <RecordDeliveryDialog
          open={!!recordingItem}
          onOpenChange={(open) => !open && setRecordingId(null)}
          fulfillmentItemId={recordingItem.id}
          remaining={recordingItem.remaining}
          unitLabel={recordingItem.unit}
        />
      )}
    </div>
  );
}
