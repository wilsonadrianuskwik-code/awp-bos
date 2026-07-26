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
import type { QuotationDetail } from "@/features/quotations/types";
import type {
  BrandingSettings,
  CompanyProfile,
  PaymentDetails,
} from "@/features/templates/types";

type QuotationPrintViewProps = {
  quotation: QuotationDetail;
  workspaceName: string;
  logoUrl?: string | null;
  companyProfile?: CompanyProfile;
  branding?: BrandingSettings;
  paymentDetails?: PaymentDetails;
};

/**
 * Quotations keep the plain subtotal/discount/tax totals — they were
 * never moved to the document-level PPN model that Invoices and Proforma
 * Invoices use, so the Indonesian breakdown doesn't apply here.
 */
export function QuotationPrintView({
  quotation,
  workspaceName,
  logoUrl,
  companyProfile,
  branding,
  paymentDetails,
}: QuotationPrintViewProps) {
  const fmt = (value: number) => formatCurrency(value, quotation.currency);

  return (
    <DocumentShell
      documentLabel="Quotation"
      companyName={companyProfile?.display_name || workspaceName}
      logoUrl={logoUrl}
    >
      <DocumentParties
        partyHeading="Prepared For"
        partyName={quotation.client?.name ?? "Deleted client"}
        partyLines={[quotation.client?.company, quotation.client?.email]}
        fields={[
          {
            label: "Issue Date",
            value: new Date(quotation.issue_date).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }),
          },
          {
            label: "Quotation Number",
            value:
              quotation.version > 1
                ? `${quotation.quotation_number} (V${quotation.version})`
                : quotation.quotation_number,
          },
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
        {quotation.line_items.map((item) => (
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

      <DocumentTotals
        rows={[
          { label: "Subtotal", value: fmt(quotation.subtotal) },
          ...(quotation.discount_amount > 0
            ? [{ label: "Discount", value: `(${fmt(quotation.discount_amount)})` }]
            : []),
          ...(quotation.tax_amount > 0
            ? [{ label: "PPN", value: fmt(quotation.tax_amount) }]
            : []),
        ]}
        total={{ label: "Total", value: fmt(quotation.total) }}
      />

      <DocumentFootnote
        paymentDetails={paymentDetails}
        branding={branding}
        notes={quotation.notes}
        terms={quotation.terms_and_conditions}
      />
    </DocumentShell>
  );
}
