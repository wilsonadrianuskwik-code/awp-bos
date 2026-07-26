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
import { SimplePrintView } from "@/features/documents/components/simple-print-view";
import { formatIndonesianDate } from "@/features/documents/components/document-letterhead";
import { PrintButton } from "@/features/documents/components/print-button";
import type { BrandingSettings, CompanyProfile } from "@/features/templates/types";

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
  workspaceName,
  logoUrl,
  companyProfile,
  branding,
}: {
  deliveryOrder: DeliveryOrderDetail;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  logoUrl?: string | null;
  companyProfile?: CompanyProfile;
  branding?: BrandingSettings;
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
    <>
      {/* print:hidden so the on-screen layout doesn't print alongside the
          document view below it. */}
      <div className="space-y-6 print:hidden">
      <DetailHeader
        title={deliveryOrder.do_number}
        backHref={`/${workspaceSlug}/delivery-orders`}
        backLabel="Delivery Orders"
        badges={<StatusBadge status={status} />}
        subtitle={deliveryOrder.client?.name ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <PrintButton
              filename={`${deliveryOrder.client?.name ?? "Client"} - ${deliveryOrder.do_number}`}
            />
            {next && (
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
            )}
          </div>
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
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Project</dt>
            <dd className="mt-1 text-sm">
              {deliveryOrder.project ? (
                <Link href={`/${workspaceSlug}/projects/${deliveryOrder.project.id}`} className="hover:underline">
                  {deliveryOrder.project.code} — {deliveryOrder.project.name}
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
            <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
              <span className="min-w-0">
                <span className="block truncate">{item.description}</span>
                {!item.source_line_item_id && (
                  <span className="block text-xs text-muted-foreground">
                    Not linked to an invoice line — won&apos;t update fulfillment
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {item.quantity} {item.unit ?? ""}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t pt-2.5 text-xs text-muted-foreground">
          {status === "delivered"
            ? "These quantities have been recorded against the invoice's fulfillment."
            : "Marking this delivered records these quantities against the invoice's fulfillment."}
        </p>
      </Card>
    </div>

      <SimplePrintView
        workspaceName={workspaceName}
        logoUrl={logoUrl}
        companyProfile={companyProfile}
        branding={branding}
        documentLabel="Delivery Order"
        meta={[
          { label: "Nomor", value: deliveryOrder.do_number },
          ...(deliveryOrder.delivery_date
            ? [{ label: "Tanggal", value: formatIndonesianDate(deliveryOrder.delivery_date) }]
            : []),
          { label: "Kepada", value: deliveryOrder.client?.name ?? "-" },
          ...(deliveryOrder.invoice
            ? [{ label: "Invoice", value: deliveryOrder.invoice.invoice_number }]
            : []),
          ...(deliveryOrder.project
            ? [{ label: "Proyek", value: deliveryOrder.project.code }]
            : []),
        ]}
        lines={deliveryOrder.line_items}
        currency="IDR"
        showPricing={false}
        notes={deliveryOrder.notes}
      />
    </>
  );
}
