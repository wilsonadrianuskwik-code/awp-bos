import {
  DocumentLetterhead,
  DocumentPaymentInfo,
  DocumentSignature,
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

export type PrintParty = {
  heading: string;
  name: string;
  lines: (string | null | undefined)[];
};

type SimplePrintViewProps = {
  workspaceName: string;
  logoUrl?: string | null;
  companyProfile?: CompanyProfile;
  branding?: BrandingSettings;
  paymentDetails?: PaymentDetails;
  documentLabel: string;
  documentNumber: string;
  party: PrintParty;
  meta: { label: string; value: string }[];
  title?: string | null;
  lines: PrintLine[];
  currency: string;
  /** Omitted for documents that carry no money (Delivery Orders). */
  showPricing?: boolean;
  /** Rendered where a totals block belongs — callers pass the tax breakdown. */
  totals?: React.ReactNode;
  notes?: string | null;
  terms?: string | null;
  footerNote?: string | null;
};

/**
 * The shared print/PDF layout for document types that don't have a
 * bespoke one (Proforma Invoice, Purchase Order, Delivery Order). Same
 * masthead and signature block as Invoice/Quotation so everything the
 * business sends out looks like it came from one company.
 */
export function SimplePrintView({
  workspaceName,
  logoUrl,
  companyProfile,
  branding,
  paymentDetails,
  documentLabel,
  documentNumber,
  party,
  meta,
  title,
  lines,
  currency,
  showPricing = true,
  totals,
  notes,
  terms,
  footerNote,
}: SimplePrintViewProps) {
  const fmt = (value: number) => formatCurrency(value, currency);

  return (
    <div className="hidden print:block print:text-black">
      <DocumentLetterhead
        workspaceName={workspaceName}
        logoUrl={logoUrl}
        tagline={branding?.tagline}
        companyProfile={companyProfile}
        documentLabel={documentLabel}
        documentNumber={documentNumber}
      />

      <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
        <div>
          <p className="font-semibold text-gray-500">{party.heading}</p>
          <p className="font-medium">{party.name}</p>
          {party.lines.filter(Boolean).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        <div className="text-right">
          {meta.map((m) => (
            <p key={m.label}>
              <span className="text-gray-500">{m.label}: </span>
              {m.value}
            </p>
          ))}
        </div>
      </div>

      {title && <h3 className="mt-6 text-lg font-semibold">{title}</h3>}

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b-2 text-left">
            <th className="py-2">Description</th>
            <th className="py-2 text-right">Qty</th>
            {showPricing && (
              <>
                <th className="py-2 text-right">Unit Price</th>
                <th className="py-2 text-right">Disc.</th>
                <th className="py-2 text-right">Total</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {lines.map((item) => (
            <tr key={item.id} className="border-b">
              <td className="py-1.5">{item.description}</td>
              <td className="py-1.5 text-right">
                {item.quantity}
                {item.unit ? ` ${item.unit}` : ""}
              </td>
              {showPricing && (
                <>
                  <td className="py-1.5 text-right">{fmt(item.unit_price ?? 0)}</td>
                  <td className="py-1.5 text-right">
                    {item.discount_percent ? `${item.discount_percent}%` : "-"}
                  </td>
                  <td className="py-1.5 text-right font-medium">
                    {fmt(item.line_total ?? 0)}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {totals && (
        <div className="mt-4 flex justify-end">
          <div className="w-72">{totals}</div>
        </div>
      )}

      {notes && (
        <div className="mt-6 text-sm">
          <p className="font-semibold">Notes</p>
          <div
            className="mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: notes }}
          />
        </div>
      )}

      {terms && (
        <div className="mt-4 text-sm">
          <p className="font-semibold">Terms &amp; Conditions</p>
          <div
            className="mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: terms }}
          />
        </div>
      )}

      {footerNote && (
        <p className="mt-8 text-center text-xs text-gray-500">{footerNote}</p>
      )}

      <DocumentPaymentInfo bankAccounts={paymentDetails?.bank_accounts} />

      <DocumentSignature branding={branding} />
    </div>
  );
}
