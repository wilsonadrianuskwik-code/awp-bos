"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  ChevronDown,
  Copy,
  GitCompare,
  Pencil,
  Printer,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { StatusBadge } from "@/components/shared/status-badge";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { QuotationLifecycleTimeline } from "./quotation-lifecycle-timeline";
import { LineItemsTable } from "@/features/line-items/components/line-items-table";
import { QuotationStatusActions } from "./quotation-status-actions";
import { isEditableStatus } from "@/features/quotations/helpers";
import { QuotationVersionHistory } from "./quotation-version-history";
import { QuotationVersionDiffDialog } from "./quotation-version-diff-dialog";
import { GenerateInvoiceDialog } from "./generate-invoice-dialog";
import { GenerateDocumentMenu } from "@/features/documents/components/generate-document-menu";
import { GeneratePurchaseOrderDialog } from "@/features/documents/components/generate-purchase-order-dialog";
import { QuotationPortalAccessCard } from "./quotation-portal-access-card";
import { LinkedDocumentsList } from "@/features/documents/components/linked-documents-card";
import { PricingSummary } from "@/features/line-items/components/pricing-summary";
import { QuotationPrintView } from "./quotation-print-view";
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
  Panel,
  PanelHeader,
} from "@/features/documents/components/detail/detail-panel";
import {
  documentFilename,
  printDocument,
} from "@/features/documents/components/print-button";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatDate } from "@/lib/utils/date";
import type {
  QuotationDetail as QuotationDetailType,
  QuotationWithClient,
} from "@/features/quotations/types";
import type { Activity } from "@/features/activities/types";
import type {
  DocumentTemplateWithTheme,
  CompanyProfile,
  BrandingSettings,
  PaymentDetails,
} from "@/features/templates/types";
import type { PackageItem } from "@/features/catalog/types";
import type { Supplier } from "@/features/suppliers/types";
import type { DocumentLink } from "@/features/documents/queries";

type QuotationDetailProps = {
  quotation: QuotationDetailType;
  activities: Activity[];
  versions: QuotationWithClient[];
  previousVersion: QuotationDetailType | null;
  workspace: {
    name: string;
    logo_url: string | null;
    settings?: {
      company_profile?: CompanyProfile;
      branding?: BrandingSettings;
      payment_details?: PaymentDetails;
    } | null;
  };
  /**
   * Still fetched by the route, but no longer drives print — see the
   * print view below. Kept so the designer/preview can use it later.
   */
  template?: DocumentTemplateWithTheme | null;
  /** Live package contents by catalog_item_id, for any package line items
      on this quotation — see getPackageBreakdowns. */
  packageBreakdowns?: Record<string, PackageItem[]>;
  /** Needed only to pick a supplier when generating a Purchase Order. */
  suppliers?: Supplier[];
  /** Traceability chain — what this quotation came from and produced. */
  links?: DocumentLink[];
};

const TAB_VALUES = ["items", "versions", "activity"];

export function QuotationDetail({
  quotation,
  activities,
  versions,
  previousVersion,
  workspace: workspaceInfo,
  packageBreakdowns = {},
  suppliers = [],
  links = [],
}: QuotationDetailProps) {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [generateInvoiceOpen, setGenerateInvoiceOpen] = useState(false);
  const [generatePoOpen, setGeneratePoOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [tab, setTab] = useHashTab(TAB_VALUES, "items");

  // Terminal states can't seed new documents — everything else can,
  // including draft (generating never consumes or locks the source, so
  // there's no reason to gate it behind sending/approval).
  const canGenerate = !["rejected", "expired", "cancelled"].includes(
    quotation.status
  );

  function handlePrint() {
    printDocument(
      documentFilename(
        quotation.quotation_number,
        quotation.client?.name ?? "Client",
        formatCurrency(quotation.total ?? 0)
      )
    );
  }

  // Lets the quotation card's "Download PDF"/"Print" quick actions trigger
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
    navigator.clipboard.writeText(quotation.quotation_number);
    toast("Quotation number copied", "success");
  }

  const expired =
    !!quotation.expiry_date &&
    new Date(quotation.expiry_date) < new Date() &&
    quotation.status !== "approved";

  const hasProse = !!(
    quotation.notes ||
    quotation.terms_and_conditions ||
    quotation.internal_notes ||
    quotation.customer_response_notes
  );

  // Sits beside the number wherever the number ends up: in the
  // subtitle when the document has its own title, otherwise next to
  // the heading, which is the number itself.
  const copyNumberButton = (
    <button
      type="button"
      onClick={handleCopyNumber}
      title="Copy quotation number"
      className="text-muted-foreground/70 hover:text-foreground"
    >
      <Copy className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div>
      <div className="space-y-4 print:hidden">
        <DocumentToolbar
          backHref={`/${workspace.slug}/quotations`}
          backLabel="Back to Quotations"
          title={quotation.title || quotation.quotation_number}
          badges={
            <>
              {!quotation.title && copyNumberButton}
              {quotation.version > 1 && (
                <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-medium text-muted-foreground">
                  V{quotation.version}
                </span>
              )}
              <StatusBadge status={quotation.status} />
            </>
          }
          subtitle={
            <>
              {/* The number is the heading when the document has no title of
                  its own — no point printing it twice. */}
              {quotation.title && (
                <>
                  <span className="font-medium text-foreground/80">
                    {quotation.quotation_number}
                  </span>
                  {copyNumberButton}
                  <span aria-hidden>·</span>
                </>
              )}
              <span className="truncate">
                {partyLabel(quotation.client?.name, quotation.client?.company, "Deleted client")}
              </span>
              {quotation.converted_invoice && (
                <DocumentChip
                  href={`/${workspace.slug}/invoices/${quotation.converted_invoice.id}`}
                  icon={<Receipt className="h-3 w-3 shrink-0" />}
                >
                  {quotation.converted_invoice.invoice_number}
                </DocumentChip>
              )}
              {quotation.project && (
                <DocumentChip
                  href={`/${workspace.slug}/projects/${quotation.project.id}`}
                  icon={<Building2 className="h-3 w-3 shrink-0" />}
                >
                  {quotation.project.code} — {quotation.project.name}
                </DocumentChip>
              )}
            </>
          }
          actions={
            <>
              {/* Invoice is deliberately absent here: it has its own
                  approved-only flow via GenerateInvoiceDialog (which also
                  sets the generated_invoice_id back-link and enforces
                  one-invoice-per-quotation). These two targets have no
                  such constraints — a quotation can seed a Proforma
                  Invoice or a supplier PO at any point while it's still
                  live. */}
              {canGenerate && (
                <GenerateDocumentMenu
                  fromType="quotation"
                  fromId={quotation.id}
                  onNeedsInput={() => setGeneratePoOpen(true)}
                  targets={[
                    {
                      toType: "proforma_invoice",
                      label: "Proforma Invoice",
                      routeSegment: "proforma-invoices",
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
              {isEditableStatus(quotation.status) && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/${workspace.slug}/quotations/${quotation.id}/edit`}>
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
            label: "Quoted Total",
            value: formatCurrency(quotation.total),
          }}
          metrics={[
            {
              label: "Valid Until",
              value: quotation.expiry_date
                ? formatDate(quotation.expiry_date)
                : "—",
              tone: expired ? "danger" : "default",
              hint: expired ? "Expired" : undefined,
            },
            { label: "Items", value: quotation.line_items.length },
          ]}
          actions={
            <QuotationStatusActions
              quotation={quotation}
              onGenerateInvoice={() => setGenerateInvoiceOpen(true)}
            />
          }
        />

        <Tabs value={tab} onValueChange={setTab} className="space-y-3">
          <DocumentTabsList
            value={tab}
            tabs={[
              {
                value: "items",
                label: "Items",
                count: quotation.line_items.length,
              },
              { value: "versions", label: "Versions", count: versions.length },
              { value: "activity", label: "Activity" },
            ]}
          />

          <TabsContent value="items" className="mt-0">
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Panel>
                <LineItemsTable
                  lineItems={quotation.line_items}
                  packageBreakdowns={packageBreakdowns}
                />

                {hasProse && (
                  <Collapsible className="mt-4 border-t pt-3">
                    <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
                      <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                      Notes, terms &amp; responses
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 pt-3">
                      {quotation.notes && (
                        <Prose label="Notes" html={quotation.notes} />
                      )}
                      {quotation.terms_and_conditions && (
                        <Prose
                          label="Terms & Conditions"
                          html={quotation.terms_and_conditions}
                        />
                      )}
                      {quotation.internal_notes && (
                        <Prose
                          label="Internal Notes (staff only)"
                          html={quotation.internal_notes}
                        />
                      )}
                      {quotation.customer_response_notes && (
                        <div className="rounded-lg border border-amber-200 p-3 dark:border-amber-900">
                          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            Customer Response
                          </p>
                          <p className="mt-1 text-sm">
                            {quotation.customer_response_notes}
                          </p>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </Panel>

              <PricingSummary
                totals={{
                  subtotal: quotation.subtotal,
                  discount_amount: quotation.discount_amount,
                  tax_amount: quotation.tax_amount,
                  total: quotation.total,
                }}
                itemCount={quotation.line_items.length}
                sticky={false}
              />
            </div>
          </TabsContent>

          <TabsContent value="versions" className="mt-0">
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Panel>
                <PanelHeader
                  title="Versions"
                  actions={
                    previousVersion ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setDiffOpen(true)}
                      >
                        <GitCompare className="mr-1.5 h-3.5 w-3.5" />
                        Compare with V{previousVersion.version}
                      </Button>
                    ) : undefined
                  }
                />
                <QuotationVersionHistory
                  versions={versions}
                  currentId={quotation.id}
                />
              </Panel>
              <Panel>
                <PanelHeader title="Lifecycle" />
                <QuotationLifecycleTimeline
                  quotation={quotation}
                  activities={activities}
                />
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="activity" className="mt-0">
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Panel>
                <PanelHeader title="Activity" />
                <ActivityTimeline activities={activities} />
              </Panel>
              <div className="space-y-3">
                {links.length > 0 && (
                  <Panel>
                    <PanelHeader title="Linked documents" />
                    <LinkedDocumentsList
                      links={links}
                      workspaceSlug={workspace.slug}
                    />
                  </Panel>
                )}
                <QuotationPortalAccessCard quotation={quotation} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* See InvoiceDetail: printed directly rather than via the template
          renderer, so all five document types share one layout. */}
      <QuotationPrintView
        quotation={quotation}
        workspaceName={workspaceInfo.name}
        logoUrl={workspaceInfo.logo_url}
        companyProfile={workspaceInfo.settings?.company_profile}
        branding={workspaceInfo.settings?.branding}
        paymentDetails={workspaceInfo.settings?.payment_details}
      />

      <GenerateInvoiceDialog
        open={generateInvoiceOpen}
        onOpenChange={setGenerateInvoiceOpen}
        quotation={quotation}
      />

      <GeneratePurchaseOrderDialog
        open={generatePoOpen}
        onOpenChange={setGeneratePoOpen}
        fromType="quotation"
        fromId={quotation.id}
        fromNumber={quotation.quotation_number}
        suppliers={suppliers}
      />

      {previousVersion && (
        <QuotationVersionDiffDialog
          open={diffOpen}
          onOpenChange={setDiffOpen}
          current={quotation}
          previous={previousVersion}
        />
      )}
    </div>
  );
}

function Prose({ label, html }: { label: string; html: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div
        className="mt-1 text-sm [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
