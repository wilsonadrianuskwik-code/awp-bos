"use client";

import Link from "next/link";
import { useWorkspace } from "@/providers/workspace-provider";

type FulfillmentItemContextProps = {
  description: string;
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  purchased: number;
  delivered: number;
  remaining: number;
  unitLabel?: string | null;
  // Detail page: navigable links to the invoice/client. Record Delivery
  // dialog: plain text — a modal shouldn't invite navigating away from the
  // in-progress form.
  linkable?: boolean;
};

// The single, unmissable answer to "what item am I delivering, for whom,
// and how much is left" — shared by the fulfillment detail page and the
// Record Delivery dialog so the two never show this information
// differently.
export function FulfillmentItemContext({
  description,
  invoiceId,
  invoiceNumber,
  clientId,
  clientName,
  purchased,
  delivered,
  remaining,
  unitLabel,
  linkable = true,
}: FulfillmentItemContextProps) {
  const { workspace } = useWorkspace();
  const unit = unitLabel ? ` ${unitLabel}` : "";

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Item
        </p>
        <p className="text-lg font-semibold leading-tight">{description}</p>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div>
          <span className="text-muted-foreground">Invoice: </span>
          {linkable ? (
            <Link
              href={`/${workspace.slug}/invoices/${invoiceId}`}
              className="font-medium text-primary hover:underline"
            >
              {invoiceNumber}
            </Link>
          ) : (
            <span className="font-medium">{invoiceNumber}</span>
          )}
        </div>
        <div>
          <span className="text-muted-foreground">Client: </span>
          {linkable ? (
            <Link
              href={`/${workspace.slug}/clients/${clientId}`}
              className="font-medium text-primary hover:underline"
            >
              {clientName}
            </Link>
          ) : (
            <span className="font-medium">{clientName}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 border-t pt-3">
        <div>
          <p className="text-xs text-muted-foreground">Purchased</p>
          <p className="text-lg font-bold tabular-nums">
            {purchased}
            {unit}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Delivered</p>
          <p className="text-lg font-bold tabular-nums">
            {delivered}
            {unit}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Remaining</p>
          <p className="text-lg font-bold tabular-nums">
            {remaining}
            {unit}
          </p>
        </div>
      </div>
    </div>
  );
}
