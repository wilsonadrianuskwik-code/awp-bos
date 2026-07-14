"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { BackButton } from "@/components/shared/back-button";
import { useWorkspace } from "@/providers/workspace-provider";
import { FulfillmentItemContext } from "@/features/fulfillment/components/fulfillment-item-context";
import { FulfillmentProgress } from "@/features/fulfillment/components/fulfillment-progress";
import { FulfillmentStatusActions } from "@/features/fulfillment/components/fulfillment-status-actions";
import { RecordDeliveryDialog } from "@/features/fulfillment/components/record-delivery-dialog";
import { FulfillmentEventList } from "@/features/fulfillment/components/fulfillment-event-list";
import type {
  FulfillmentEventWithRecorder,
  FulfillmentItemWithProgress,
} from "@/features/fulfillment/types";

type FulfillmentDetailProps = {
  item: FulfillmentItemWithProgress;
  events: FulfillmentEventWithRecorder[];
};

export function FulfillmentDetail({ item, events }: FulfillmentDetailProps) {
  const { workspace } = useWorkspace();
  const [recordOpen, setRecordOpen] = useState(false);

  return (
    <div className="space-y-6">
      <BackButton href={`/${workspace.slug}/fulfillment`} label="Back to Fulfillment" />

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-muted-foreground">
          Fulfillment Tracker
        </p>
        <StatusBadge status={item.status} />
      </div>

      {/* The single, unmissable answer to "what item am I fulfilling, for
          whom, and how much is left" — the redesign's core goal. */}
      <Card>
        <CardContent className="pt-6">
          <FulfillmentItemContext
            description={item.description}
            invoiceId={item.invoice_id}
            invoiceNumber={item.invoice_number}
            clientId={item.client_id}
            clientName={item.client_name}
            purchased={item.purchased}
            delivered={item.delivered}
            remaining={item.remaining}
            unitLabel={item.unit}
          />
          <div className="mt-4">
            <FulfillmentProgress
              purchased={item.purchased}
              delivered={item.delivered}
              remaining={item.remaining}
              progressPercent={item.progress_percent}
              isOverDelivered={item.is_over_delivered}
              unitLabel={item.unit}
            />
          </div>
        </CardContent>
      </Card>

      <FulfillmentStatusActions
        fulfillmentItemId={item.id}
        status={item.status}
        onRecordDelivery={() => setRecordOpen(true)}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery History</CardTitle>
        </CardHeader>
        <CardContent>
          <FulfillmentEventList events={events} unitLabel={item.unit} />
        </CardContent>
      </Card>

      {item.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{item.notes}</p>
          </CardContent>
        </Card>
      )}

      <RecordDeliveryDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        fulfillmentItemId={item.id}
        description={item.description}
        invoiceId={item.invoice_id}
        invoiceNumber={item.invoice_number}
        clientId={item.client_id}
        clientName={item.client_name}
        purchased={item.purchased}
        delivered={item.delivered}
        remaining={item.remaining}
        unitLabel={item.unit}
      />
    </div>
  );
}
