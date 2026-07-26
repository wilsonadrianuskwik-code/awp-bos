import { formatCurrency } from "@/lib/utils/format-currency";
import {
  DocumentFootnote,
  DocumentParties,
  DocumentShell,
  DocumentTable,
  DocumentTableCell,
  DocumentTableRow,
  DocumentTotals,
  type DocumentMetaField,
} from "@/features/documents/components/document-shell";
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

export type PrintTotalRow = { label: string; value: string; muted?: boolean };

type SimplePrintViewProps = {
  workspaceName: string;
  logoUrl?: string | null;
  companyProfile?: CompanyProfile;
  branding?: BrandingSettings;
  paymentDetails?: PaymentDetails;
  documentLabel: string;
  party: PrintParty;
  meta: DocumentMetaField[];
  lines: PrintLine[];
  currency: string;
  /** Omitted for documents that carry no money (Delivery Orders). */
  showPricing?: boolean;
  totalRows?: PrintTotalRow[];
  total?: { label: string; value: string };
  notes?: string | null;
  terms?: string | null;
};

/**
 * The print layout for Proforma Invoice, Purchase Order and Delivery
 * Order. Composes the same shell as Invoice and Quotation, so all five
 * document types are the same document with different content.
 */
export function SimplePrintView({
  workspaceName,
  logoUrl,
  companyProfile,
  branding,
  paymentDetails,
  documentLabel,
  party,
  meta,
  lines,
  currency,
  showPricing = true,
  totalRows,
  total,
  notes,
  terms,
}: SimplePrintViewProps) {
  const fmt = (value: number) => formatCurrency(value, currency);

  return (
    <DocumentShell
      documentLabel={documentLabel}
      companyName={companyProfile?.display_name || workspaceName}
      logoUrl={logoUrl}
    >
      <DocumentParties
        partyHeading={party.heading}
        partyName={party.name}
        partyLines={party.lines}
        fields={meta}
      />

      <DocumentTable
        columns={[
          { key: "description", label: "Description" },
          { key: "quantity", label: "Quantity", align: "right", className: "w-28" },
          ...(showPricing
            ? [
                {
                  key: "unit_price",
                  label: "Unit Price",
                  align: "right" as const,
                  className: "w-36",
                },
                {
                  key: "amount",
                  label: "Amount",
                  align: "right" as const,
                  className: "w-36",
                },
              ]
            : []),
        ]}
      >
        {lines.map((item) => (
          <DocumentTableRow key={item.id}>
            <DocumentTableCell>{item.description}</DocumentTableCell>
            <DocumentTableCell align="right">
              {item.quantity}
              {item.unit ? ` ${item.unit}` : ""}
            </DocumentTableCell>
            {showPricing && (
              <>
                <DocumentTableCell align="right" className="tabular-nums">
                  {fmt(item.unit_price ?? 0)}
                </DocumentTableCell>
                <DocumentTableCell align="right" className="tabular-nums">
                  {fmt(item.line_total ?? 0)}
                </DocumentTableCell>
              </>
            )}
          </DocumentTableRow>
        ))}
      </DocumentTable>

      {showPricing && (totalRows?.length || total) && (
        <DocumentTotals rows={totalRows ?? []} total={total} />
      )}

      <DocumentFootnote
        paymentDetails={paymentDetails}
        branding={branding}
        notes={notes}
        terms={terms}
      />
    </DocumentShell>
  );
}
