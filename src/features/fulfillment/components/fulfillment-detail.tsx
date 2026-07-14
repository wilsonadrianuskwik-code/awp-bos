"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useWorkspace } from "@/providers/workspace-provider";
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {item.description}
            </h1>
            <StatusBadge status={item.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link
              href={`/${workspace.slug}/clients/${item.client_id}`}
              className="text-primary hover:underline"
            >
              {item.client_name}
            </Link>
            {" · "}
            <Link
              href={`/${workspace.slug}/invoices/${item.invoice_id}`}
              className="text-primary hover:underline"
            >
              {item.invoice_number}
            </Link>
          </p>
        </div>
      </div>

      <FulfillmentStatusActions
        fulfillmentItemId={item.id}
        status={item.status}
        onRecordDelivery={() => setRecordOpen(true)}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
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
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <FulfillmentProgress
                purchased={item.purchased}
                delivered={item.delivered}
                remaining={item.remaining}
                progressPercent={item.progress_percent}
                isOverDelivered={item.is_over_delivered}
                unitLabel={item.unit}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <RecordDeliveryDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        fulfillmentItemId={item.id}
        remaining={item.remaining}
        unitLabel={item.unit}
      />
    </div>
  );
}
