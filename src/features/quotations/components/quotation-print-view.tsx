import { SimplePrintView } from "@/features/documents/components/simple-print-view";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatIndonesianDate } from "@/features/documents/components/document-letterhead";
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
 * Fallback print layout, used when the workspace has no configured
 * template. Composes the shared document layout so it is visually the
 * same document as every other type.
 *
 * Quotations keep the plain subtotal/discount/tax totals — they were
 * never moved to the document-level PPN model that Invoices and Proforma
 * Invoices use, so the tax breakdown block doesn't apply here.
 */
export function QuotationPrintView({
  quotation,
  workspaceName,
  logoUrl,
  companyProfile,
  branding,
  paymentDetails,
}: QuotationPrintViewProps) {
  return (
    <SimplePrintView
      workspaceName={workspaceName}
      logoUrl={logoUrl}
      companyProfile={companyProfile}
      branding={branding}
      paymentDetails={paymentDetails}
      documentLabel="Quotation"
      meta={[
        {
          label: "Nomor",
          value:
            quotation.version > 1
              ? `${quotation.quotation_number} (V${quotation.version})`
              : quotation.quotation_number,
        },
        { label: "Tanggal", value: formatIndonesianDate(quotation.issue_date) },
        { label: "Kepada", value: quotation.client?.name ?? "-" },
        ...(quotation.expiry_date
          ? [{ label: "Berlaku s/d", value: formatIndonesianDate(quotation.expiry_date) }]
          : []),
      ]}
      title={quotation.title}
      lines={quotation.line_items}
      currency={quotation.currency}
      totals={
        <table className="border-collapse text-[12px]">
          <tbody>
            <TotalRow
              label="Subtotal"
              value={quotation.subtotal}
              currency={quotation.currency}
            />
            {quotation.discount_amount > 0 && (
              <TotalRow
                label="Diskon"
                value={quotation.discount_amount}
                currency={quotation.currency}
              />
            )}
            {quotation.tax_amount > 0 && (
              <TotalRow
                label="PPN"
                value={quotation.tax_amount}
                currency={quotation.currency}
              />
            )}
            <TotalRow
              label="Total"
              value={quotation.total}
              currency={quotation.currency}
              emphasized
            />
          </tbody>
        </table>
      }
      notes={quotation.notes}
      terms={quotation.terms_and_conditions}
    />
  );
}

function TotalRow({
  label,
  value,
  currency,
  emphasized = false,
}: {
  label: string;
  value: number;
  currency: string;
  emphasized?: boolean;
}) {
  const border = emphasized
    ? "border-2 border-double border-black"
    : "border border-black";
  return (
    <tr>
      <td className={`${border} px-2 py-1 font-bold uppercase`}>{label}</td>
      <td className={`${border} w-36 px-2 py-1 text-right font-bold tabular-nums`}>
        {formatCurrency(value, currency, { hideSymbol: true })}
      </td>
    </tr>
  );
}
