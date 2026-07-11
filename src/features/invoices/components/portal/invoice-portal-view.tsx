"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { LineItemsTable } from "@/features/line-items/components/line-items-table";
import { PricingSummary } from "@/features/line-items/components/pricing-summary";
import { recordInvoiceFirstView } from "@/features/invoices/actions";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { LineItem } from "@/features/line-items/types";
import type { InvoiceStatus, PaymentMethod } from "@/features/invoices/types";

// A deliberately narrow, customer-safe projection of InvoiceDetail/Payment —
// built by the portal page (a server component) before this client
// component ever receives it. Client component props are serialized into
// the page's payload regardless of what the JSX renders, so trimming here
// (rather than just not rendering certain fields) is what actually keeps
// internal IDs, staff identities, and internal references off this public,
// unauthenticated route.
export type PortalInvoicePayment = {
  id: string;
  amount: number;
  currency: string;
  payment_method: PaymentMethod;
  payment_date: string;
};

export type PortalInvoice = {
  invoice_number: string;
  status: InvoiceStatus;
  title: string | null;
  summary: string | null;
  client: { name: string; company: string | null };
  issue_date: string;
  due_date: string | null;
  currency: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  line_items: LineItem[];
  payments: PortalInvoicePayment[];
  notes: string | null;
  payment_terms: string | null;
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  credit_card: "Credit Card",
  cash: "Cash",
  check: "Check",
  paypal: "PayPal",
  stripe: "Stripe",
  other: "Other",
};

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type InvoicePortalViewProps = {
  shareToken: string;
  invoice: PortalInvoice;
  workspaceName: string;
};

export function InvoicePortalView({
  shareToken,
  invoice: initialInvoice,
  workspaceName,
}: InvoicePortalViewProps) {
  const [invoice, setInvoice] = useState(initialInvoice);

  useEffect(() => {
    // Fire-and-forget view tracking: the page has already rendered from
    // server-fetched data by the time this runs, so a failure here (network
    // blip, RPC error) must never surface to the customer — it only means
    // view_count/last_viewed_at didn't get bumped this visit.
    recordInvoiceFirstView(shareToken)
      .then((result) => {
        // Only the status can change as a result of this call (sent ->
        // viewed) — pick just that field rather than spreading the full
        // Invoice record, which carries workspace_id/created_by and other
        // fields that must not enter this component's state.
        if (result.data) {
          setInvoice((prev) => ({ ...prev, status: result.data.status }));
        }
      })
      .catch(() => {});
  }, [shareToken]);

  const fmt = (value: number) => formatCurrency(value, invoice.currency);

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-background px-4 py-10">
      <div className="mb-8 flex items-center justify-between border-b pb-6">
        <h1 className="text-xl font-bold">{workspaceName}</h1>
        <div className="text-right">
          <h2 className="text-lg font-semibold uppercase tracking-wide text-muted-foreground">
            Invoice
          </h2>
          <p className="text-sm">{invoice.invoice_number}</p>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-2">
        <StatusBadge status={invoice.status} />
      </div>

      {invoice.title && (
        <h3 className="mb-1 text-2xl font-semibold">{invoice.title}</h3>
      )}
      {invoice.summary && (
        <p className="mb-6 text-muted-foreground">{invoice.summary}</p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Billed to</p>
          <p className="font-medium">{invoice.client.name}</p>
          {invoice.client.company && <p>{invoice.client.company}</p>}
        </div>
        <div className="text-right">
          <p>
            <span className="text-muted-foreground">Issue date: </span>
            {formatDate(invoice.issue_date)}
          </p>
          {invoice.due_date && (
            <p>
              <span className="text-muted-foreground">Due date: </span>
              {formatDate(invoice.due_date)}
            </p>
          )}
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <LineItemsTable
            lineItems={invoice.line_items}
            currency={invoice.currency}
          />
        </CardContent>
      </Card>

      <div className="mb-6">
        <PricingSummary
          totals={{
            subtotal: invoice.subtotal,
            discount_amount: invoice.discount_amount,
            tax_amount: invoice.tax_amount,
            total: invoice.total,
          }}
          currency={invoice.currency}
          itemCount={invoice.line_items.length}
          sticky={false}
        />
      </div>

      <Card className="mb-6 border-2">
        <CardHeader>
          <CardTitle className="text-base">Balance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Outstanding Balance
            </p>
            <p className="text-3xl font-bold tabular-nums tracking-tight">
              {fmt(invoice.amount_due)}
            </p>
          </div>
          <div className="flex justify-between border-t pt-3 text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="tabular-nums">{fmt(invoice.total)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Amount Paid</span>
            <span className="tabular-nums">{fmt(invoice.amount_paid)}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Payment History</CardTitle>
        </CardHeader>
        <CardContent>
          {invoice.payments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No payments received yet.
            </p>
          ) : (
            <div className="space-y-3">
              {invoice.payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                >
                  <div>
                    <p className="font-medium tabular-nums">
                      {fmt(payment.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(payment.payment_date)} ·{" "}
                      {PAYMENT_METHOD_LABEL[payment.payment_method] ??
                        payment.payment_method}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {invoice.notes && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="text-sm [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
              dangerouslySetInnerHTML={{ __html: invoice.notes }}
            />
          </CardContent>
        </Card>
      )}

      {invoice.payment_terms && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Payment Terms</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{invoice.payment_terms}</p>
          </CardContent>
        </Card>
      )}

      {invoice.due_date && (
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Payment is due by {formatDate(invoice.due_date)}.
        </p>
      )}
    </div>
  );
}
