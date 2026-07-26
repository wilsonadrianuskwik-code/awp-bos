"use client";

import Link from "next/link";
import { Copy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { DetailHeader } from "@/components/shared/detail-header";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { LineItemsTable } from "@/features/line-items/components/line-items-table";
import { GenerateDocumentMenu } from "@/features/documents/components/generate-document-menu";
import { LinkedDocumentsCard } from "@/features/documents/components/linked-documents-card";
import { TaxSettingsCard } from "@/features/documents/components/tax-settings-card";
import { TaxBreakdownBlock } from "@/features/documents/components/tax-breakdown";
import { SimplePrintView } from "@/features/documents/components/simple-print-view";
import { PrintButton } from "@/features/documents/components/print-button";
import { ProformaInvoiceStatusActions } from "./proforma-invoice-status-actions";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { ProformaInvoiceDetail as ProformaInvoiceDetailType } from "@/features/proforma-invoices/types";
import type { DocumentLink } from "@/features/documents/queries";
import type { Activity } from "@/features/activities/types";
import type {
  BrandingSettings,
  CompanyProfile,
  PaymentDetails,
} from "@/features/templates/types";

const DOCUMENT_LABEL: Record<string, string> = {
  quotation: "Quotation",
  proforma_invoice: "Proforma Invoice",
  invoice: "Invoice",
  purchase_order: "Purchase Order",
  delivery_order: "Delivery Order",
  payment: "Payment",
};

const ROUTE_SEGMENT: Record<string, string> = {
  quotation: "quotations",
  proforma_invoice: "proforma-invoices",
  invoice: "invoices",
  purchase_order: "purchase-orders",
  delivery_order: "delivery-orders",
};

type ProformaInvoiceDetailProps = {
  proformaInvoice: ProformaInvoiceDetailType;
  activities: Activity[];
  links: DocumentLink[];
  /** Company branding for the printable view. */
  workspaceName: string;
  logoUrl?: string | null;
  companyProfile?: CompanyProfile;
  branding?: BrandingSettings;
  paymentDetails?: PaymentDetails;
};

export function ProformaInvoiceDetail({
  proformaInvoice,
  activities,
  links,
  workspaceName,
  logoUrl,
  companyProfile,
  branding,
  paymentDetails,
}: ProformaInvoiceDetailProps) {
  const { workspace } = useWorkspace();
  const { toast } = useToast();

  function handleCopyNumber() {
    navigator.clipboard.writeText(proformaInvoice.pi_number);
    toast("Proforma invoice number copied", "success");
  }

  const canGenerateInvoice =
    proformaInvoice.status === "accepted" && !proformaInvoice.generated_invoice_id;

  return (
    <>
      {/* print:hidden so the on-screen layout doesn't print alongside the
          document view below it. */}
      <div className="space-y-6 print:hidden">
      <DetailHeader
        backHref={`/${workspace.slug}/proforma-invoices`}
        backLabel="Back to Proforma Invoices"
        title={proformaInvoice.title || proformaInvoice.pi_number}
        badges={<StatusBadge status={proformaInvoice.status} />}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {proformaInvoice.pi_number}
            {" · "}
            {proformaInvoice.client?.name ?? "Deleted client"}
            {proformaInvoice.client?.company ? ` · ${proformaInvoice.client.company}` : ""}
            <button
              type="button"
              onClick={handleCopyNumber}
              title="Copy proforma invoice number"
              className="text-muted-foreground/70 hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </span>
        }
        actions={
          <>
            {canGenerateInvoice && (
              <GenerateDocumentMenu
                fromType="proforma_invoice"
                fromId={proformaInvoice.id}
                targets={[
                  { toType: "invoice", label: "Invoice", routeSegment: "invoices" },
                ]}
              />
            )}
            <PrintButton
              filename={`${proformaInvoice.client?.name ?? "Client"} - ${proformaInvoice.pi_number}`}
            />
          </>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Total
            </p>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">
              {formatCurrency(proformaInvoice.total, proformaInvoice.currency)}
            </p>
          </div>
          <ProformaInvoiceStatusActions proformaInvoice={proformaInvoice} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Line Items</CardTitle>
            </CardHeader>
            <CardContent>
              <LineItemsTable
                lineItems={proformaInvoice.line_items}
                currency={proformaInvoice.currency}
              />
            </CardContent>
          </Card>

          {proformaInvoice.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className="text-sm [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                  dangerouslySetInnerHTML={{ __html: proformaInvoice.notes }}
                />
              </CardContent>
            </Card>
          )}

          {proformaInvoice.terms_and_conditions && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Terms &amp; Conditions</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className="text-sm [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                  dangerouslySetInnerHTML={{ __html: proformaInvoice.terms_and_conditions }}
                />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right rail: the Inspector — Linked Documents traceability chain
            (get_document_relationships) plus the audit trail. */}
        <div className="space-y-6">
          <TaxSettingsCard
            workspaceId={workspace.id}
            documentType="proforma_invoice"
            documentId={proformaInvoice.id}
            hargaJual={proformaInvoice.subtotal - proformaInvoice.discount_amount}
            currency={proformaInvoice.currency}
            settings={{
              dpp_numerator: proformaInvoice.dpp_numerator,
              dpp_denominator: proformaInvoice.dpp_denominator,
              ppn_percent: proformaInvoice.ppn_percent,
              pph_percent: proformaInvoice.pph_percent,
              retensi_percent: proformaInvoice.retensi_percent,
              show_dpp: proformaInvoice.show_dpp,
            }}
            editable={proformaInvoice.status === "draft"}
          />

          <LinkedDocumentsCard links={links} workspaceSlug={workspace.slug} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline activities={activities} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>

      <SimplePrintView
        workspaceName={workspaceName}
        logoUrl={logoUrl}
        companyProfile={companyProfile}
        branding={branding}
        paymentDetails={paymentDetails}
        documentLabel="Proforma Invoice"
        documentNumber={proformaInvoice.pi_number}
        party={{
          heading: "Billed to",
          name: proformaInvoice.client?.name ?? "Deleted client",
          lines: [
            proformaInvoice.client?.company,
            proformaInvoice.client?.email,
            proformaInvoice.client?.phone,
          ],
        }}
        meta={[
          { label: "Issue date", value: new Date(proformaInvoice.issue_date).toLocaleDateString() },
          ...(proformaInvoice.expiry_date
            ? [{ label: "Valid until", value: new Date(proformaInvoice.expiry_date).toLocaleDateString() }]
            : []),
        ]}
        title={proformaInvoice.title}
        lines={proformaInvoice.line_items}
        currency={proformaInvoice.currency}
        totals={
          <TaxBreakdownBlock
            hargaJual={proformaInvoice.subtotal - proformaInvoice.discount_amount}
            currency={proformaInvoice.currency}
            settings={{
              dpp_numerator: proformaInvoice.dpp_numerator,
              dpp_denominator: proformaInvoice.dpp_denominator,
              ppn_percent: proformaInvoice.ppn_percent,
              pph_percent: proformaInvoice.pph_percent,
              retensi_percent: proformaInvoice.retensi_percent,
              show_dpp: proformaInvoice.show_dpp,
            }}
            dense
          />
        }
        notes={proformaInvoice.notes}
        terms={proformaInvoice.terms_and_conditions}
      />
    </>
  );
}
