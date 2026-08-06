"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  updateDeliveryOrder,
  updateDeliveryOrderStatus,
} from "@/features/delivery-orders/actions";
import {
  DeliveryAddressField,
  toDeliveryAddress,
  type AddressSuggestion,
} from "@/features/delivery-orders/components/delivery-address-field";
import { addressLines, formatAddress } from "@/features/documents/address";
import { DELIVERY_ORDER_STATUSES, type DeliveryOrderDetail } from "@/features/delivery-orders/types";
import { SimplePrintView } from "@/features/documents/components/simple-print-view";
import {
  documentFilename,
  PrintButton,
} from "@/features/documents/components/print-button";
import { DocumentToolbar } from "@/features/documents/components/detail/document-toolbar";
import { DocumentAuditCard } from "@/features/activities/components/document-audit-card";
import type { Activity } from "@/features/activities/types";
import {
  Fact,
  FactGrid,
  Panel,
  PanelHeader,
} from "@/features/documents/components/detail/detail-panel";
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
  activities,
  workspaceId,
  workspaceSlug,
  workspaceName,
  logoUrl,
  companyProfile,
  branding,
}: {
  deliveryOrder: DeliveryOrderDetail;
  activities: Activity[];
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

  // The delivery destination is editable right up until the DO is
  // cancelled (mirrors update_delivery_order in 00089): sites get
  // corrected, and a delivered DO's address is a record worth fixing.
  const [address, setAddress] = useState(
    formatAddress(deliveryOrder.delivery_address) ?? ""
  );
  const [savedAddress, setSavedAddress] = useState(address);
  const addressDirty = address.trim() !== savedAddress.trim();
  const addressEditable = status !== "cancelled";

  const suggestions: AddressSuggestion[] = [
    ...(deliveryOrder.project?.site_address
      ? [{
          label: `Project site — ${deliveryOrder.project.code}`,
          address: deliveryOrder.project.site_address,
        }]
      : []),
    ...(deliveryOrder.client?.address
      ? [{ label: `Client — ${deliveryOrder.client.name}`, address: deliveryOrder.client.address }]
      : []),
  ];

  function handleSaveAddress() {
    startTransition(async () => {
      const result = await updateDeliveryOrder(workspaceId, deliveryOrder.id, {
        delivery_address: toDeliveryAddress(address),
      });
      if (!result.error) setSavedAddress(address);
    });
  }

  // What the printed document addresses: the override when set,
  // otherwise the client's own address.
  const printAddressLines = deliveryOrder.delivery_address
    ? addressLines(deliveryOrder.delivery_address)
    : addressLines(deliveryOrder.client?.address ?? null);

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
      <div className="space-y-4 print:hidden">
        <DocumentToolbar
          title={deliveryOrder.do_number}
          backHref={`/${workspaceSlug}/delivery-orders`}
          backLabel="Back to Delivery Orders"
          badges={<StatusBadge status={status} />}
          subtitle={
            <span className="truncate">
              {deliveryOrder.client?.name ?? "No client"}
            </span>
          }
          actions={
            <>
              <PrintButton
                size="sm"
                filename={documentFilename(
                  deliveryOrder.do_number,
                  deliveryOrder.client?.name ?? "Client"
                )}
              />
              {next && (
                <>
                  {/* Who signed for the goods — captured at the moment it
                      is recorded, not in a separate step afterwards. */}
                  {next === "delivered" && (
                    <Input
                      placeholder="Received by"
                      value={receivedBy}
                      onChange={(e) => setReceivedBy(e.target.value)}
                      className="h-8 w-40"
                    />
                  )}
                  <Button size="sm" disabled={isPending} onClick={handleAdvance}>
                    Mark as {next}
                  </Button>
                </>
              )}
            </>
          }
        />

        {/* One panel, not three: a delivery order is a short document —
            where it goes, what is on it, and who received it. */}
        <Panel>
          <FactGrid>
            <Fact label="Invoice">
              {deliveryOrder.invoice ? (
                <Link
                  href={`/${workspaceSlug}/invoices/${deliveryOrder.invoice.id}`}
                  className="hover:underline"
                >
                  {deliveryOrder.invoice.invoice_number}
                </Link>
              ) : (
                "—"
              )}
            </Fact>
            <Fact label="Project">
              {deliveryOrder.project ? (
                <Link
                  href={`/${workspaceSlug}/projects/${deliveryOrder.project.id}`}
                  className="hover:underline"
                >
                  {deliveryOrder.project.code} — {deliveryOrder.project.name}
                </Link>
              ) : (
                "—"
              )}
            </Fact>
            <Fact label="Client">{deliveryOrder.client?.name ?? "—"}</Fact>
            <Fact label="Delivery date">
              {deliveryOrder.delivery_date ?? "—"}
            </Fact>
            <Fact label="Received by">{deliveryOrder.received_by ?? "—"}</Fact>
            {deliveryOrder.notes && (
              <Fact label="Notes" className="col-span-2">
                {deliveryOrder.notes}
              </Fact>
            )}
          </FactGrid>

          <div className="mt-4 border-t pt-4">
            <PanelHeader
              title="Deliver to"
              hint="Where the goods go. Leave blank to address the client's own address instead."
              className="mb-2"
            />
            <DeliveryAddressField
              value={address}
              onChange={setAddress}
              suggestions={suggestions}
              disabled={!addressEditable}
            />
            {addressDirty && addressEditable && (
              <Button
                size="sm"
                className="mt-2"
                disabled={isPending}
                onClick={handleSaveAddress}
              >
                Save address
              </Button>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Items"
            hint={
              status === "delivered"
                ? "These quantities have been recorded against the invoice's fulfillment."
                : "Marking this delivered records these quantities against the invoice's fulfillment."
            }
          />
          <ul className="divide-y">
            {deliveryOrder.line_items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 py-2 text-[13px]"
              >
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
        </Panel>

        <Panel>
          <PanelHeader title="Record" />
          <DocumentAuditCard
            activities={activities}
            createdAt={deliveryOrder.created_at}
          />
        </Panel>
      </div>

      <SimplePrintView
        workspaceName={workspaceName}
        logoUrl={logoUrl}
        companyProfile={companyProfile}
        branding={branding}
        documentLabel="Delivery Order"
        showSignature={deliveryOrder.show_signature}
        party={{
          heading: "Deliver To",
          name: deliveryOrder.client?.name ?? "Deleted client",
          lines: [deliveryOrder.client?.company, ...printAddressLines],
        }}
        meta={[
          ...(deliveryOrder.delivery_date
            ? [{
                label: "Delivery Date",
                value: new Date(deliveryOrder.delivery_date).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }),
              }]
            : []),
          { label: "DO Number", value: deliveryOrder.do_number },
        ]}
        lines={deliveryOrder.line_items}
        showPricing={false}
        notes={deliveryOrder.notes}
      />
    </>
  );
}
