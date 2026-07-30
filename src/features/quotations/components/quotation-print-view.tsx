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
 * Totals use the same Indonesian breakdown as every other document
 * (00088), so a quotation and the invoice generated from it can never
 * total differently from the same line items.
 */
export function QuotationPrintView({
  quotation,
  workspaceName,
  logoUrl,
  companyProfile,
  branding,
  paymentDetails,
}: QuotationPrintViewProps) {
  const fmt = (value: number) => formatCurrency(value);

  const settings = {
    dpp_numerator: quotation.dpp_numerator,
    dpp_denominator: quotation.dpp_denominator,
    ppn_percent: quotation.ppn_percent,
    pph_percent: quotation.pph_percent,
    retensi_percent: quotation.retensi_percent,
    show_dpp: quotation.show_dpp,
  };
  const breakdown = computeTaxBreakdown(
    quotation.subtotal - quotation.discount_amount,
    settings
  );

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
        rows={taxTotalRows(breakdown, settings, fmt)}
        total={{ label: "Total", value: fmt(breakdown.total) }}
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
