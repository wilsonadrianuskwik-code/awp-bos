"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TaxSettingsPanel } from "@/features/documents/components/tax-settings-panel";
import { InvoiceReferencesPanel } from "@/features/invoices/components/invoice-references-panel";
import { InvoicePortalAccessPanel } from "@/features/invoices/components/invoice-portal-access-panel";
import type { InvoiceDetail } from "@/features/invoices/types";

/**
 * The invoice's configuration, in a slide-over rather than three cards
 * down the right rail.
 *
 * These are all "set once, check rarely" surfaces — the Faktur Pajak
 * serial arrives weeks later, the tax rates are usually the workspace
 * default, the portal link is copied once. They were occupying a third
 * of the page permanently to be used a few times per invoice, so they
 * moved behind a button. Every field, action and permission rule is
 * unchanged; only where they live changed.
 */
export function InvoiceSettingsSheet({
  open,
  onOpenChange,
  invoice,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceDetail;
  workspaceId: string;
}) {
  // Same rule as the builder and update_invoice (00087): rates are
  // editable until money lands against the invoice.
  const taxEditable =
    !["cancelled", "refunded"].includes(invoice.status) &&
    (invoice.amount_paid ?? 0) === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="mb-5">
          <SheetTitle>Invoice settings</SheetTitle>
          <SheetDescription>
            References, tax treatment and the client&apos;s portal link.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          <Section
            title="Totals &amp; tax"
            hint={
              taxEditable
                ? undefined
                : "Locked — a paid or closed invoice keeps the rates it was issued under."
            }
          >
            <TaxSettingsPanel
              workspaceId={workspaceId}
              documentType="invoice"
              documentId={invoice.id}
              hargaJual={invoice.subtotal - invoice.discount_amount}
              settings={{
                dpp_numerator: invoice.dpp_numerator,
                dpp_denominator: invoice.dpp_denominator,
                ppn_percent: invoice.ppn_percent,
                pph_percent: invoice.pph_percent,
                retensi_percent: invoice.retensi_percent,
                show_dpp: invoice.show_dpp,
              }}
              editable={taxEditable}
            />
          </Section>

          <Section title="References">
            <InvoiceReferencesPanel
              workspaceId={workspaceId}
              invoiceId={invoice.id}
              customerPoNumber={invoice.customer_po_number}
              taxInvoiceNumber={invoice.tax_invoice_number}
            />
          </Section>

          <Section title="Customer portal">
            <InvoicePortalAccessPanel invoice={invoice} />
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-[13px] font-semibold tracking-tight">{title}</h3>
      {hint && <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
