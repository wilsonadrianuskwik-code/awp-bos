"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Building2, Copy, GitCompare, Printer, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { DetailHeader } from "@/components/shared/detail-header";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { QuotationLifecycleTimeline } from "./quotation-lifecycle-timeline";
import { LineItemsTable } from "@/features/line-items/components/line-items-table";
import { QuotationStatusActions } from "./quotation-status-actions";
import { QuotationSummaryHero } from "./quotation-summary-hero";
import { QuotationVersionHistory } from "./quotation-version-history";
import { QuotationVersionDiffDialog } from "./quotation-version-diff-dialog";
import { GenerateInvoiceDialog } from "./generate-invoice-dialog";
import { GenerateDocumentMenu } from "@/features/documents/components/generate-document-menu";
import { GeneratePurchaseOrderDialog } from "@/features/documents/components/generate-purchase-order-dialog";
import { QuotationPortalAccessCard } from "./quotation-portal-access-card";
import { PricingSummary } from "@/features/line-items/components/pricing-summary";
import { QuotationPrintView } from "./quotation-print-view";
import { DocumentRenderView } from "@/features/templates/renderer/components/document-render-view";
import { quotationToRenderData } from "@/features/templates/renderer/adapters";
import { formatCurrency } from "@/lib/utils/format-currency";
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
  template: DocumentTemplateWithTheme | null;
  /** Live package contents by catalog_item_id, for any package line items
      on this quotation — see getPackageBreakdowns. */
  packageBreakdowns?: Record<string, PackageItem[]>;
  /** Needed only to pick a supplier when generating a Purchase Order. */
  suppliers?: Supplier[];
};

export function QuotationDetail({
  quotation,
  activities,
  versions,
  previousVersion,
  workspace: workspaceInfo,
  template,
  packageBreakdowns = {},
  suppliers = [],
}: QuotationDetailProps) {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [generateInvoiceOpen, setGenerateInvoiceOpen] = useState(false);
  const [generatePoOpen, setGeneratePoOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);

  // Terminal states can't seed new documents — everything else can,
  // including draft (generating never consumes or locks the source, so
  // there's no reason to gate it behind sending/approval).
  const canGenerate = !["rejected", "expired", "cancelled"].includes(
    quotation.status
  );

  function handlePrint() {
    const clientName = quotation.client?.name ?? "Client";
    const total = formatCurrency(quotation.total ?? 0, quotation.currency);
    const filename = sanitizeFilename(`${clientName} - ${quotation.quotation_number} - ${total}`);
    const prevTitle = document.title;
    document.title = filename;
    window.print();
    document.title = prevTitle;
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

  return (
    <div>
      <div className="space-y-6 print:hidden">
        <DetailHeader
          backHref={`/${workspace.slug}/quotations`}
          backLabel="Back to Quotations"
          title={quotation.title || quotation.quotation_number}
          badges={
            <>
              {quotation.version > 1 && (
                <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-medium text-muted-foreground">
                  V{quotation.version}
                </span>
              )}
              <StatusBadge status={quotation.status} />
            </>
          }
          subtitle={
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              {quotation.quotation_number}
              {quotation.internal_id && (
                <span className="text-muted-foreground/70">
                  · Internal ID {quotation.internal_id}
                </span>
              )}
              · {quotation.client?.name ?? "Deleted client"}
              {quotation.client?.company ? ` · ${quotation.client.company}` : ""}
              <button
                type="button"
                onClick={handleCopyNumber}
                title="Copy quotation number"
                className="text-muted-foreground/70 hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              {quotation.converted_invoice && (
                <Link
                  href={`/${workspace.slug}/invoices/${quotation.converted_invoice.id}`}
                  className="ml-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                >
                  <Receipt className="h-3 w-3" />
                  Generated {quotation.converted_invoice.invoice_number}
                </Link>
              )}
              {quotation.project && (
                <Link
                  href={`/${workspace.slug}/projects/${quotation.project.id}`}
                  className="ml-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                >
                  <Building2 className="h-3 w-3" />
                  {quotation.project.code} — {quotation.project.name}
                </Link>
              )}
            </span>
          }
          actions={
            <>
              {previousVersion && (
                <Button variant="outline" onClick={() => setDiffOpen(true)}>
                  <GitCompare className="mr-2 h-4 w-4" />
                  Compare with V{previousVersion.version}
                </Button>
              )}
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
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Print
              </Button>
            </>
          }
        />

        <QuotationSummaryHero
          quotation={quotation}
          actions={
            <QuotationStatusActions
              quotation={quotation}
              onGenerateInvoice={() => setGenerateInvoiceOpen(true)}
            />
          }
        />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Line Items</CardTitle>
              </CardHeader>
              <CardContent>
                <LineItemsTable
                  lineItems={quotation.line_items}
                  currency={quotation.currency}
                  packageBreakdowns={packageBreakdowns}
                />
              </CardContent>
            </Card>

            {quotation.notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className="text-sm [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                    dangerouslySetInnerHTML={{ __html: quotation.notes }}
                  />
                </CardContent>
              </Card>
            )}

            {quotation.terms_and_conditions && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Terms &amp; Conditions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className="text-sm [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                    dangerouslySetInnerHTML={{
                      __html: quotation.terms_and_conditions,
                    }}
                  />
                </CardContent>
              </Card>
            )}

            {quotation.internal_notes && (
              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle className="flex items-center gap-1.5 text-base">
                    Internal Notes
                    <span className="text-xs font-normal text-muted-foreground">
                      (staff only)
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className="text-sm [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                    dangerouslySetInnerHTML={{ __html: quotation.internal_notes }}
                  />
                </CardContent>
              </Card>
            )}

            {quotation.customer_response_notes && (
              <Card className="border-amber-200 dark:border-amber-900">
                <CardHeader>
                  <CardTitle className="text-base">Customer Response</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{quotation.customer_response_notes}</p>
                </CardContent>
              </Card>
            )}

          </div>

          <div className="space-y-6">
            <PricingSummary
              totals={{
                subtotal: quotation.subtotal,
                discount_amount: quotation.discount_amount,
                tax_amount: quotation.tax_amount,
                total: quotation.total,
              }}
              currency={quotation.currency}
              itemCount={quotation.line_items.length}
              sticky={false}
            />

            <QuotationPortalAccessCard quotation={quotation} />

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <QuotationLifecycleTimeline
                  quotation={quotation}
                  activities={activities}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Versions</CardTitle>
              </CardHeader>
              <CardContent>
                <QuotationVersionHistory
                  versions={versions}
                  currentId={quotation.id}
                />
              </CardContent>
            </Card>

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
        data={quotationToRenderData(quotation, workspaceInfo, packageBreakdowns)}
        fallback={
          <QuotationPrintView
            quotation={quotation}
            workspaceName={workspaceInfo.name}
            logoUrl={workspaceInfo.logo_url}
            companyProfile={workspaceInfo.settings?.company_profile}
            branding={workspaceInfo.settings?.branding}
            paymentDetails={workspaceInfo.settings?.payment_details}
          />
        }
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

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();
}
