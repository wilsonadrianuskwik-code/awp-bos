import {
  DocumentLetterhead,
  DocumentMeta,
  DocumentPaymentInfo,
  DocumentSignature,
  type MetaRow,
} from "@/features/documents/components/document-letterhead";
import { formatCurrency } from "@/lib/utils/format-currency";
import type {
  BrandingSettings,
  CompanyProfile,
  PaymentDetails,
} from "@/features/templates/types";

export type PrintLine = {
  id: string;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price?: number;
  discount_percent?: number | null;
  line_total?: number;
};

type SimplePrintViewProps = {
  workspaceName: string;
  logoUrl?: string | null;
  companyProfile?: CompanyProfile;
  branding?: BrandingSettings;
  paymentDetails?: PaymentDetails;
  documentLabel: string;
  /** Rendered in the meta block; callers build the rows they need. */
  meta: MetaRow[];
  title?: string | null;
  lines: PrintLine[];
  currency: string;
  /** Omitted for documents that carry no money (Delivery Orders). */
  showPricing?: boolean;
  /** Rendered where the totals belong — callers pass the tax breakdown. */
  totals?: React.ReactNode;
  notes?: string | null;
  terms?: string | null;
  /**
   * Blank rows padded onto the table so it fills the page like the
   * pre-printed forms this replaces. 0 disables the padding.
   */
  minRows?: number;
};

/**
 * The shared print/PDF layout, styled to match the company's existing
 * paper documents: framed letterhead, Indonesian label:value meta block,
 * green-headed bordered item table, then payment details and signature.
 *
 * Amounts print with Indonesian digit grouping and no currency symbol —
 * the column header already says "(Rp)", so repeating it on every row is
 * noise, and it's what the reference does.
 */
export function SimplePrintView({
  workspaceName,
  logoUrl,
  companyProfile,
  branding,
  paymentDetails,
  documentLabel,
  meta,
  title,
  lines,
  currency,
  showPricing = true,
  totals,
  notes,
  terms,
  minRows = 9,
}: SimplePrintViewProps) {
  const amount = (value: number) =>
    formatCurrency(value, currency, { hideSymbol: true });

  const blankRowCount = Math.max(0, minRows - lines.length);

  return (
    <div className="hidden print:block print:text-black">
      <DocumentLetterhead
        workspaceName={workspaceName}
        logoUrl={logoUrl}
        tagline={branding?.tagline}
        companyProfile={companyProfile}
        documentLabel={documentLabel}
      />

      <DocumentMeta rows={meta} />

      {title && <h3 className="mt-5 text-[15px] font-bold">{title}</h3>}

      <table className="mt-5 w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-[#4caf50] text-white">
            <Th className="w-10 text-center">No.</Th>
            <Th>Deskripsi</Th>
            <Th className="w-20 text-center">Jumlah</Th>
            <Th className="w-20 text-center">Unit</Th>
            {showPricing && (
              <>
                <Th className="w-32 text-center">
                  Harga (Rp)
                  <span className="block text-[10px] font-semibold">Exc. PPN</span>
                </Th>
                <Th className="w-32 text-center">
                  Total (Rp)
                  <span className="block text-[10px] font-semibold">Exc. PPN</span>
                </Th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {lines.map((item, i) => (
            <tr key={item.id}>
              <Td className="text-center font-semibold">{i + 1}</Td>
              <Td>{item.description}</Td>
              <Td className="text-center">{item.quantity}</Td>
              <Td className="text-center">{item.unit ?? ""}</Td>
              {showPricing && (
                <>
                  <Td className="text-right">{amount(item.unit_price ?? 0)}</Td>
                  <Td className="text-right">{amount(item.line_total ?? 0)}</Td>
                </>
              )}
            </tr>
          ))}
          {/* Padding rows keep the table the same height as the
              pre-printed form regardless of how many items there are. */}
          {Array.from({ length: blankRowCount }).map((_, i) => (
            <tr key={`blank-${i}`}>
              <Td className="text-center font-semibold">
                {lines.length + i + 1}
              </Td>
              <Td>-</Td>
              <Td />
              <Td />
              {showPricing && (
                <>
                  <Td />
                  <Td />
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {totals && <div className="mt-0 flex justify-end">{totals}</div>}

      <DocumentPaymentInfo bankAccounts={paymentDetails?.bank_accounts} />

      {notes && (
        <div className="mt-6 text-[12px]">
          <p className="font-bold">Catatan</p>
          <div
            className="mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: notes }}
          />
        </div>
      )}

      {terms && (
        <div className="mt-4 text-[12px]">
          <p className="font-bold">Syarat &amp; Ketentuan</p>
          <div
            className="mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: terms }}
          />
        </div>
      )}

      <DocumentSignature branding={branding} />
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`border border-black px-2 py-1.5 text-center align-middle text-[12px] font-bold ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`h-7 border border-black px-2 py-1 align-middle ${className}`}>
      {children}
    </td>
  );
}
