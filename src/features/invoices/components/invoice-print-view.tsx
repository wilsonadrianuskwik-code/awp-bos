import { formatCurrency } from "@/lib/utils/format-currency";
import {
  DocumentFootnote,
  DocumentParties,
  DocumentShell,
  DocumentTable,
  DocumentTableCell,
  DocumentTableRow,
  DocumentTotals,
} from "@/features/documents/components/document-shell";
import { computeTaxBreakdown, taxTotalRows } from "@/features/documents/tax";
import type { InvoiceDetail } from "@/features/invoices/types";
import type {
  BrandingSettings,
  CompanyProfile,
  PaymentDetails,
} from "@/features/templates/types";

type InvoicePrintViewProps = {
  invoice: InvoiceDetail;
  workspaceName: string;
  logoUrl?: string | null;
  companyProfile?: CompanyProfile;
  branding?: BrandingSettings;
  paymentDetails?: PaymentDetails;
};

export function InvoicePrintView({
  invoice,
  workspaceName,
  logoUrl,
  companyProfile,
  branding,
  paymentDetails,
}: InvoicePrintViewProps) {
  const fmt = (value: number) => formatCurrency(value, invoice.currency);

  const settings = {
    dpp_numerator: invoice.dpp_numerator,
    dpp_denominator: invoice.dpp_denominator,
    ppn_percent: invoice.ppn_percent,
    pph_percent: invoice.pph_percent,
    retensi_percent: invoice.retensi_percent,
    show_dpp: invoice.show_dpp,
  };
  const breakdown = computeTaxBreakdown(
    invoice.subtotal - invoice.discount_amount,
    settings
  );

  return (
    <DocumentShell
      documentLabel="Invoice"
      companyName={companyProfile?.display_name || workspaceName}
      logoUrl={logoUrl}
    >
      <DocumentParties
        partyHeading="Bill To"
        partyName={invoice.client?.name ?? "Deleted client"}
        partyLines={[invoice.client?.company, invoice.client?.email]}
        fields={[
          {
            label: "Invoice Date",
            value: new Date(invoice.issue_date).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }),
          },
          { label: "Invoice Number", value: invoice.invoice_number },
        ]}
      />

      <DocumentTable
        columns={[
          { key: "description", label: "Description" },
          { key: "quantity", label: "Quantity", align: "right", className: "w-28" },
          { key: "unit_price", label: "Unit Price", align: "right", className: "w-36" },
          { key: "amount", label: "Amount", align: "right", className: "w-36" },
        ]}
      >
        {invoice.line_items.map((item) => (
          <DocumentTableRow key={item.id}>
            <DocumentTableCell>{item.description}</DocumentTableCell>
            <DocumentTableCell align="right">
              {item.quantity}
              {item.unit ? ` ${item.unit}` : ""}
            </DocumentTableCell>
            <DocumentTableCell align="right" className="tabular-nums">
              {fmt(item.unit_price)}
            </DocumentTableCell>
            <DocumentTableCell align="right" className="tabular-nums">
              {fmt(item.line_total)}
            </DocumentTableCell>
          </DocumentTableRow>
        ))}
      </DocumentTable>

      {/* Payment state deliberately stays off the printed invoice: the
          document states what is billed, and payments recorded against it
          are tracked in the app. A printed "Balance Due Rp 0" turns an
          invoice into a receipt, which it isn't. */}
      <DocumentTotals
        rows={taxTotalRows(breakdown, settings, fmt)}
        total={{ label: "Total", value: fmt(breakdown.total) }}
      />

      <DocumentFootnote
        paymentDetails={paymentDetails}
        branding={branding}
        notes={invoice.notes}
        terms={invoice.payment_terms}
      />
    </DocumentShell>
  );
}
