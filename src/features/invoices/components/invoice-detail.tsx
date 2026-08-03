"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  ChevronDown,
  Copy,
  FileText,
  Hash,
  Pencil,
  Printer,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { StatusBadge } from "@/components/shared/status-badge";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { LineItemsTable } from "@/features/line-items/components/line-items-table";
import { InvoiceStatusActions } from "@/features/invoices/components/invoice-status-actions";
import { RecordPaymentDialog } from "@/features/invoices/components/record-payment-dialog";
import { PaymentHistory } from "@/features/invoices/components/payment-history";
import { InvoiceSettingsSheet } from "@/features/invoices/components/invoice-settings-sheet";
import { InvoicePrintView } from "@/features/invoices/components/invoice-print-view";
import { DeliveryOrdersSection } from "@/features/delivery-orders/components/delivery-orders-section";
import { GenerateDocumentMenu } from "@/features/documents/components/generate-document-menu";
import { GeneratePurchaseOrderDialog } from "@/features/documents/components/generate-purchase-order-dialog";
import { LinkedDocumentsList } from "@/features/documents/components/linked-documents-card";
import { TaxBreakdownBlock } from "@/features/documents/components/tax-breakdown";
import {
  DocumentChip,
  DocumentToolbar,
  partyLabel,
} from "@/features/documents/components/detail/document-toolbar";
import { DocumentSummaryBar } from "@/features/documents/components/detail/document-summary-bar";
import {
  DocumentTabsList,
  useHashTab,
} from "@/features/documents/components/detail/document-tabs";
import {
  Fact,
  FactGrid,
  Panel,
  PanelHeader,
} from "@/features/documents/components/detail/detail-panel";
import type { DeliveryOrderWithRelations } from "@/features/delivery-orders/types";
import type { DocumentLink } from "@/features/documents/queries";
import type { Supplier } from "@/features/suppliers/types";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatDate, getOverdueDays } from "@/lib/utils/date";
import { getPaymentProgress } from "@/features/invoices/helpers";
import type { InvoiceDetail as InvoiceDetailType } from "@/features/invoices/types";
import type { Activity } from "@/features/activities/types";
import type { FulfillmentItemWithProgress } from "@/features/fulfillment/types";
import type {
  DocumentTemplateWithTheme,
  CompanyProfile,
  BrandingSettings,
  PaymentDetails,
} from "@/features/templates/types";
import type { PackageItem } from "@/features/catalog/types";

type InvoiceDetailProps = {
  invoice: InvoiceDetailType;
  activities: Activity[];
  workspace: {
    name: string;
    logo_url: string | null;
    settings?: {
      company_profile?: CompanyProfile;
      branding?: BrandingSettings;
      payment_details?: PaymentDetails;
    } | null;
  };
  fulfillmentItems: FulfillmentItemWithProgress[];
  /**
   * Still fetched by the route, but no longer drives print — see the
   * print view below. Kept so the designer/preview can use it later.
   */
  template?: DocumentTemplateWithTheme | null;
  /** Live package contents by catalog_item_id, for any package line items
      on this invoice — see getPackageBreakdowns. */
  packageBreakdowns?: Record<string, PackageItem[]>;
  deliveryOrders?: DeliveryOrderWithRelations[];
  /** Traceability chain — what this invoice came from and produced. */
  links?: DocumentLink[];
  /** Needed only to pick a supplier when generating a Purchase Order. */
  suppliers?: Supplier[];
};

const TAB_VALUES = ["items", "payments", "deliveries", "activity"];

/**
 * The invoice workspace: header, money line, then one tab at a time.
 *
 * This page used to stack nine cards in two columns — line items, notes,
 * deliveries, references, totals, payments, linked documents, portal,
 * activity — all mounted at once, so the two things looked at every day
 * (what is owed, and what is on the invoice) shared the screen with six
 * surfaces that are touched a handful of times per invoice. Everything
 * still exists; it is arranged by how often it is needed:
 *
 *   always visible   status, amount due/total/paid, the primary action
 *   one click        items, payments, deliveries, activity — tabs
 *   behind a button  references, tax rates, portal link — settings sheet
 *
 * No calculation, permission rule, action or server call changed.
 */
export function InvoiceDetail({
  invoice,
  activities,
  workspace: workspaceInfo,
  fulfillmentItems,
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useHashTab(TAB_VALUES, "items");

  // An invoice that was never issued shouldn't be seeding deliveries or
  // supplier orders; a cancelled/refunded one shouldn't either.
  const canGenerate = !["draft", "cancelled", "refunded"].includes(
    invoice.status
  );

  // Mirrors update_invoice (00087): a sent invoice stays editable because
  // clients do ask for revisions. Money landing against it is what closes
  // it, not the act of sending.
  const isEditable =
    !["cancelled", "refunded"].includes(invoice.status) &&
    (invoice.amount_paid ?? 0) === 0;

  function handlePrint() {
    const clientName = invoice.client?.name ?? "Client";
    const total = formatCurrency(invoice.total ?? 0);
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

  function handleCopyPortalLink() {
    const url = `${window.location.origin}/portal/invoices/${invoice.share_token}`;
    navigator.clipboard.writeText(url);
    toast("Public link copied", "success");
  }

  const isPaid = invoice.status === "paid";
  const isOverdue = invoice.status === "overdue";
  const hasNotes = !!(invoice.notes || invoice.payment_terms);

  // Sits beside the number wherever the number ends up: in the
  // subtitle when the document has its own title, otherwise next to
  // the heading, which is the number itself.
  const copyNumberButton = (
    <button
      type="button"
      onClick={handleCopyNumber}
      title="Copy invoice number"
      className="text-muted-foreground/70 hover:text-foreground"
    >
      <Copy className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div>
      <div className="space-y-4 print:hidden">
        <DocumentToolbar
          backHref={`/${workspace.slug}/invoices`}
          backLabel="Back to Invoices"
          title={invoice.title || invoice.invoice_number}
          badges={
            <>
              {!invoice.title && copyNumberButton}
              <StatusBadge
              status={invoice.status}
              label={
                invoice.status === "overdue" && invoice.due_date
                  ? `Overdue • ${getOverdueDays(invoice.due_date)} days`
                  : undefined
                }
              />
            </>
          }
          subtitle={
            <>
              {/* The number is the heading when the document has no title of
                  its own — no point printing it twice. */}
              {invoice.title && (
                <>
                  <span className="font-medium text-foreground/80">
                    {invoice.invoice_number}
                  </span>
                  {copyNumberButton}
                  <span aria-hidden>·</span>
                </>
              )}
              <span className="truncate">
                {partyLabel(invoice.client?.name, invoice.client?.company, "Deleted client")}
              </span>
              {invoice.source_quotation && (
                <DocumentChip
                  href={`/${workspace.slug}/quotations/${invoice.source_quotation.id}`}
                  icon={<FileText className="h-3 w-3 shrink-0" />}
                >
                  From {invoice.source_quotation.quotation_number}
                </DocumentChip>
              )}
              {invoice.project && (
                <DocumentChip
                  href={`/${workspace.slug}/projects/${invoice.project.id}`}
                  icon={<Building2 className="h-3 w-3 shrink-0" />}
                >
                  {invoice.project.code} — {invoice.project.name}
                </DocumentChip>
              )}
            </>
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
              {isEditable && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/${workspace.slug}/invoices/${invoice.id}/edit`}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print
              </Button>
            </>
          }
        />

        <DocumentSummaryBar
          primary={{
            label: isPaid ? "Amount Paid" : "Amount Due",
            value: formatCurrency(isPaid ? invoice.amount_paid : invoice.amount_due),
            tone: isPaid ? "success" : isOverdue ? "danger" : "default",
            hint: invoice.due_date
              ? `${isPaid ? "Was due" : "Due"} ${formatDate(invoice.due_date)}`
              : undefined,
          }}
          metrics={[
            { label: "Total", value: formatCurrency(invoice.total) },
            { label: "Paid", value: formatCurrency(invoice.amount_paid) },
            {
              label: "Issued",
              value: formatDate(invoice.issue_date),
            },
          ]}
          progress={{
            value: isPaid
              ? 100
              : getPaymentProgress(invoice.amount_paid, invoice.total),
            tone: isPaid ? "success" : isOverdue ? "danger" : "default",
          }}
          actions={
            <InvoiceStatusActions
              invoice={invoice}
              onRecordPayment={() => setRecordPaymentOpen(true)}
              menuExtras={
                <>
                  <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    Invoice settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCopyPortalLink}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy portal link
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCopyNumber}>
                    <Hash className="mr-2 h-4 w-4" />
                    Copy invoice number
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              }
            />
          }
        />

        <Tabs value={tab} onValueChange={setTab} className="space-y-3">
          <DocumentTabsList
            value={tab}
            tabs={[
              { value: "items", label: "Items", count: invoice.line_items.length },
              {
                value: "payments",
                label: "Payments",
                count: invoice.payments.length,
              },
              {
                value: "deliveries",
                label: "Deliveries",
                count: deliveryOrders.length,
              },
              { value: "activity", label: "Activity" },
            ]}
          />

          {/* Items: the document itself. Line items get the width; the
              totals block sits beside them on desktop and beneath them on
              anything narrower, which is the same order it reads in on
              the printed page. */}
          <TabsContent value="items" className="mt-0">
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Panel>
                <LineItemsTable
                  lineItems={invoice.line_items}
                  packageBreakdowns={packageBreakdowns}
                />

                {hasNotes && (
                  <Collapsible className="mt-4 border-t pt-3">
                    <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
                      <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                      Notes &amp; payment terms
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 pt-3">
                      {invoice.notes && (
                        <div
                          className="text-sm [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                          dangerouslySetInnerHTML={{ __html: invoice.notes }}
                        />
                      )}
                      {invoice.payment_terms && (
                        <div className={invoice.notes ? "border-t pt-3" : undefined}>
                          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            Payment Terms
                          </p>
                          <p className="mt-1 text-sm">{invoice.payment_terms}</p>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </Panel>

              <div className="space-y-3">
                <Panel>
                  <PanelHeader
                    title="Totals"
                    actions={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setSettingsOpen(true)}
                      >
                        <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
                        Adjust
                      </Button>
                    }
                  />
                  <TaxBreakdownBlock
                    hargaJual={invoice.subtotal - invoice.discount_amount}
                    settings={{
                      dpp_numerator: invoice.dpp_numerator,
                      dpp_denominator: invoice.dpp_denominator,
                      ppn_percent: invoice.ppn_percent,
                      pph_percent: invoice.pph_percent,
                      retensi_percent: invoice.retensi_percent,
                      show_dpp: invoice.show_dpp,
                    }}
                    dense
                  />
                </Panel>

                <Panel>
                  <PanelHeader title="Details" />
                  <FactGrid className="grid-cols-2 sm:grid-cols-2 lg:grid-cols-2">
                    <Fact label="Customer PO">
                      {invoice.customer_po_number || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Fact>
                    <Fact label="Faktur Pajak">
                      {invoice.tax_invoice_number || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Fact>
                    {invoice.internal_id && (
                      <Fact label="Internal ID">{invoice.internal_id}</Fact>
                    )}
                    <Fact label="Portal views">
                      {invoice.view_count > 0 ? invoice.view_count : "Not viewed"}
                    </Fact>
                  </FactGrid>
                </Panel>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="payments" className="mt-0">
            <Panel>
              <PanelHeader
                title="Payments"
                hint={`${formatCurrency(invoice.amount_paid)} received of ${formatCurrency(invoice.total)}`}
              />
              <PaymentHistory payments={invoice.payments} />
            </Panel>
          </TabsContent>

          <TabsContent value="deliveries" className="mt-0">
            <Panel>
              <DeliveryOrdersSection
                invoiceId={invoice.id}
                workspaceId={workspace.id}
                workspaceSlug={workspace.slug}
                deliveryOrders={deliveryOrders}
                progressByLine={fulfillmentItems}
                invoiceLineItems={invoice.line_items.map((li) => ({
                  id: li.id,
                  description: li.description,
                  quantity: li.quantity,
                  unit: li.unit,
                }))}
              />
            </Panel>
          </TabsContent>

          <TabsContent value="activity" className="mt-0">
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Panel>
                <PanelHeader title="Activity" />
                <ActivityTimeline activities={activities} />
              </Panel>
              {links.length > 0 && (
                <Panel>
                  <PanelHeader title="Linked documents" />
                  <LinkedDocumentsList
                    links={links}
                    workspaceSlug={workspace.slug}
                  />
                </Panel>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Printed straight from InvoicePrintView rather than through the
          template renderer. Proforma Invoices can't have templates at all
          (document_templates' CHECK excludes them), so routing some types
          through templates and others through this view guaranteed the
          two could never look alike — and every document the business
          sends out has to be visually the same document. */}
      <InvoicePrintView
        invoice={invoice}
        workspaceName={workspaceInfo.name}
        logoUrl={workspaceInfo.logo_url}
        companyProfile={workspaceInfo.settings?.company_profile}
        branding={workspaceInfo.settings?.branding}
        paymentDetails={workspaceInfo.settings?.payment_details}
      />

      <InvoiceSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        invoice={invoice}
        workspaceId={workspace.id}
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
