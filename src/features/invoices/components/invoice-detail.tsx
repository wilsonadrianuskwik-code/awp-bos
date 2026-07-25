"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Building2, Copy, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { DetailHeader } from "@/components/shared/detail-header";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { LineItemsTable } from "@/features/line-items/components/line-items-table";
import { InvoiceStatusActions } from "@/features/invoices/components/invoice-status-actions";
import { RecordPaymentDialog } from "@/features/invoices/components/record-payment-dialog";
import { PaymentHistory } from "@/features/invoices/components/payment-history";
import { InvoiceSummaryHero } from "@/features/invoices/components/invoice-summary-hero";
import { InvoicePortalAccessCard } from "@/features/invoices/components/invoice-portal-access-card";
import { InvoicePrintView } from "@/features/invoices/components/invoice-print-view";
import { InvoiceFulfillmentSection } from "@/features/fulfillment/components/invoice-fulfillment-section";
import { DeliveryOrdersSection } from "@/features/delivery-orders/components/delivery-orders-section";
import { GenerateDocumentMenu } from "@/features/documents/components/generate-document-menu";
import { GeneratePurchaseOrderDialog } from "@/features/documents/components/generate-purchase-order-dialog";
import { LinkedDocumentsCard } from "@/features/documents/components/linked-documents-card";
import { TaxSettingsCard } from "@/features/documents/components/tax-settings-card";
import type { DeliveryOrderWithRelations } from "@/features/delivery-orders/types";
import type { DocumentLink } from "@/features/documents/queries";
import type { Supplier } from "@/features/suppliers/types";
import { DocumentRenderView } from "@/features/templates/renderer/components/document-render-view";
import { invoiceToRenderData } from "@/features/templates/renderer/adapters";
import { formatCurrency } from "@/lib/utils/format-currency";
import { getOverdueDays } from "@/lib/utils/date";
import type { InvoiceDetail as InvoiceDetailType } from "@/features/invoices/types";
import type { Activity } from "@/features/activities/types";
import type { FulfillmentItemWithProgress } from "@/features/fulfillment/types";
import type { DocumentTemplateWithTheme, CompanyProfile, BrandingSettings } from "@/features/templates/types";
import type { PackageItem } from "@/features/catalog/types";

type InvoiceDetailProps = {
  invoice: InvoiceDetailType;
  activities: Activity[];
  workspace: {
    name: string;
    logo_url: string | null;
    settings?: { company_profile?: CompanyProfile; branding?: BrandingSettings } | null;
  };
  fulfillmentItems: FulfillmentItemWithProgress[];
  template: DocumentTemplateWithTheme | null;
  /** Live package contents by catalog_item_id, for any package line items
      on this invoice — see getPackageBreakdowns. */
  packageBreakdowns?: Record<string, PackageItem[]>;
  deliveryOrders?: DeliveryOrderWithRelations[];
  /** Traceability chain — what this invoice came from and produced. */
  links?: DocumentLink[];
  /** Needed only to pick a supplier when generating a Purchase Order. */
  suppliers?: Supplier[];
};

export function InvoiceDetail({
  invoice,
  activities,
  workspace: workspaceInfo,
  fulfillmentItems,
  template,
  packageBreakdowns = {},
  deliveryOrders = [],
  links = [],
  suppliers = [],
}: InvoiceDetailProps) {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [generatePoOpen, setGeneratePoOpen] = useState(false);

  // An invoice that was never issued shouldn't be seeding deliveries or
  // supplier orders; a cancelled/refunded one shouldn't either.
  const canGenerate = !["draft", "cancelled", "refunded"].includes(
    invoice.status
  );

  function handlePrint() {
    const clientName = invoice.client?.name ?? "Client";
    const total = formatCurrency(invoice.total ?? 0, invoice.currency);
    const filename = sanitizeFilename(`${clientName} - ${invoice.invoice_number} - ${total}`);
    const prevTitle = document.title;
    document.title = filename;
    window.print();
    document.title = prevTitle;
  }

  // Lets the invoice card's "Download PDF"/"Print" quick actions trigger
  // the browser print dialog right after navigating here, instead of
  // requiring the user to land on the page and click Print themselves.
  useEffect(() => {
    if (searchParams.get("autoprint") !== "1") return;
    handlePrint();
    const params = new URLSearchParams(searchParams.toString());
    params.delete("autoprint");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCopyNumber() {
    navigator.clipboard.writeText(invoice.invoice_number);
    toast("Invoice number copied", "success");
  }

  return (
    <div>
      <div className="space-y-6 print:hidden">
        <DetailHeader
          backHref={`/${workspace.slug}/invoices`}
          backLabel="Back to Invoices"
          title={invoice.title || invoice.invoice_number}
          badges={
            <StatusBadge
              status={invoice.status}
              label={
                invoice.status === "overdue" && invoice.due_date
                  ? `Overdue • ${getOverdueDays(invoice.due_date)} days`
                  : undefined
              }
            />
          }
          subtitle={
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              {invoice.invoice_number}
              {invoice.internal_id && (
                <span className="text-muted-foreground/70">
                  · Internal ID {invoice.internal_id}
                </span>
              )}
              · {invoice.client?.name ?? "Deleted client"}
              {invoice.client?.company ? ` · ${invoice.client.company}` : ""}
              <button
                type="button"
                onClick={handleCopyNumber}
                title="Copy invoice number"
                className="text-muted-foreground/70 hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              {invoice.source_quotation && (
                <Link
                  href={`/${workspace.slug}/quotations/${invoice.source_quotation.id}`}
                  className="ml-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                >
                  <FileText className="h-3 w-3" />
                  Converted from {invoice.source_quotation.quotation_number}
                </Link>
              )}
              {invoice.project && (
                <Link
                  href={`/${workspace.slug}/projects/${invoice.project.id}`}
                  className="ml-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                >
                  <Building2 className="h-3 w-3" />
                  {invoice.project.code} — {invoice.project.name}
                </Link>
              )}
            </span>
          }
          actions={
            <>
              {canGenerate && (
                <GenerateDocumentMenu
                  fromType="invoice"
                  fromId={invoice.id}
                  onNeedsInput={() => setGeneratePoOpen(true)}
                  targets={[
                    {
                      toType: "delivery_order",
                      label: "Delivery Order",
                      routeSegment: "delivery-orders",
                    },
                    {
                      toType: "purchase_order",
                      label: "Purchase Order",
                      routeSegment: "purchase-orders",
                      needsInput: true,
                    },
                  ]}
                />
              )}
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Print
              </Button>
            </>
          }
        />

        <InvoiceSummaryHero
          invoice={invoice}
          actions={
            <InvoiceStatusActions
              invoice={invoice}
              onRecordPayment={() => setRecordPaymentOpen(true)}
            />
          }
        />

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: the document itself — line items, its notes and terms,
              and the fulfillment tied to them. */}
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Line Items</CardTitle>
              </CardHeader>
              <CardContent>
                <LineItemsTable
                  lineItems={invoice.line_items}
                  currency={invoice.currency}
                  packageBreakdowns={packageBreakdowns}
                />
              </CardContent>
            </Card>

            {(invoice.notes || invoice.payment_terms) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Notes &amp; Terms</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {invoice.notes && (
                    <div
                      className="text-sm [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                      dangerouslySetInnerHTML={{ __html: invoice.notes }}
                    />
                  )}
                  {invoice.payment_terms && (
                    <div className={invoice.notes ? "border-t pt-4" : undefined}>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        Payment Terms
                      </p>
                      <p className="mt-1 text-sm">{invoice.payment_terms}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card id="fulfillment" className="scroll-mt-6">
              <CardHeader>
                <CardTitle className="text-base">Fulfillment</CardTitle>
              </CardHeader>
              <CardContent>
                <InvoiceFulfillmentSection
                  invoiceId={invoice.id}
                  invoiceStatus={invoice.status}
                  lineItems={invoice.line_items}
                  fulfillmentItems={fulfillmentItems}
                />
              </CardContent>
            </Card>
          </div>

          {/* Right rail: everything that happened to the invoice —
              payment history, the client portal link, and the audit
              trail — kept out of the document column. */}
          <div className="space-y-6">
            {/* scroll-mt gives the anchor breathing room when the invoice
                card's "View Payment History" quick action links here. */}
            <TaxSettingsCard
              workspaceId={workspace.id}
              documentType="invoice"
              documentId={invoice.id}
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
              editable={invoice.status === "draft"}
            />

            <Card id="payments" className="scroll-mt-6">
              <CardHeader>
                <CardTitle className="text-base">Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <PaymentHistory payments={invoice.payments} />
              </CardContent>
            </Card>

            <DeliveryOrdersSection
              invoiceId={invoice.id}
              workspaceId={workspace.id}
              workspaceSlug={workspace.slug}
              deliveryOrders={deliveryOrders}
              invoiceLineItems={invoice.line_items.map((li) => ({
                id: li.id,
                description: li.description,
                quantity: li.quantity,
                unit: li.unit,
              }))}
            />

            <LinkedDocumentsCard links={links} workspaceSlug={workspace.slug} />

            <InvoicePortalAccessCard invoice={invoice} />

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

      <DocumentRenderView
        template={template}
        data={invoiceToRenderData(invoice, workspaceInfo, packageBreakdowns)}
        fallback={
          <InvoicePrintView
            invoice={invoice}
            workspaceName={workspaceInfo.name}
            logoUrl={workspaceInfo.logo_url}
            companyProfile={workspaceInfo.settings?.company_profile}
            branding={workspaceInfo.settings?.branding}
          />
        }
      />

      <GeneratePurchaseOrderDialog
        open={generatePoOpen}
        onOpenChange={setGeneratePoOpen}
        fromType="invoice"
        fromId={invoice.id}
        fromNumber={invoice.invoice_number}
        suppliers={suppliers}
      />

      <RecordPaymentDialog
        open={recordPaymentOpen}
        onOpenChange={setRecordPaymentOpen}
        invoice={invoice}
      />
    </div>
  );
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();
}
