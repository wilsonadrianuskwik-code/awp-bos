import { SimplePrintView } from "@/features/documents/components/simple-print-view";
import { formatIndonesianDate } from "@/features/documents/components/document-letterhead";
import { TaxBreakdownBlock } from "@/features/documents/components/tax-breakdown";
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

/**
 * Fallback print layout, used when the workspace has no configured
 * template. Composes the shared document layout so it is visually the
 * same document as every other type, rather than its own one-off markup.
 */
export function InvoicePrintView({
  invoice,
  workspaceName,
  logoUrl,
  companyProfile,
  branding,
  paymentDetails,
}: InvoicePrintViewProps) {
  return (
    <SimplePrintView
      workspaceName={workspaceName}
      logoUrl={logoUrl}
      companyProfile={companyProfile}
      branding={branding}
      paymentDetails={paymentDetails}
      documentLabel="Invoice"
      meta={[
        { label: "Nomor", value: invoice.invoice_number },
        { label: "Tanggal", value: formatIndonesianDate(invoice.issue_date) },
        { label: "Kepada", value: invoice.client?.name ?? "-" },
        ...(invoice.due_date
          ? [{ label: "Jatuh Tempo", value: formatIndonesianDate(invoice.due_date) }]
          : []),
      ]}
      title={invoice.title}
      lines={invoice.line_items}
      currency={invoice.currency}
      totals={
        <TaxBreakdownBlock
          hargaJual={invoice.subtotal - invoice.discount_amount}
          currency={invoice.currency}
          settings={{
            dpp_numerator: invoice.dpp_numerator,
            dpp_denominator: invoice.dpp_denominator,
            ppn_percent: invoice.ppn_percent,
            pph_percent: invoice.pph_percent,
            retensi_percent: invoice.retensi_percent,
            show_dpp: invoice.show_dpp,
          }}
          boxed
        />
      }
      notes={invoice.notes}
    />
  );
}
