"use client";

import Link from "next/link";
import { Building2, ChevronDown, Copy, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { StatusBadge } from "@/components/shared/status-badge";
import { LineItemsTable } from "@/features/line-items/components/line-items-table";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { PurchaseOrderStatusActions } from "@/features/purchase-orders/components/purchase-order-status-actions";
import { PurchaseOrderLinks } from "@/features/purchase-orders/components/purchase-order-links";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatDate } from "@/lib/utils/date";
import { computeTaxBreakdown, taxTotalRows } from "@/features/documents/tax";
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
  Panel,
  PanelHeader,
} from "@/features/documents/components/detail/detail-panel";
import type {
  DocumentRelationship,
  PurchaseOrderDetail as PurchaseOrderDetailType,
} from "@/features/purchase-orders/types";
import type { Activity } from "@/features/activities/types";
import type { BrandingSettings, CompanyProfile } from "@/features/templates/types";
import { SimplePrintView } from "@/features/documents/components/simple-print-view";
import {
  documentFilename,
  PrintButton,
} from "@/features/documents/components/print-button";

type PurchaseOrderDetailProps = {
  purchaseOrder: PurchaseOrderDetailType;
  activities: Activity[];
  relationships: DocumentRelationship[];
  /** Company branding for the printable view. */
  workspaceName: string;
  logoUrl?: string | null;
  companyProfile?: CompanyProfile;
  branding?: BrandingSettings;
};

const TAB_VALUES = ["items", "activity"];

// Same shape as the Invoice and Proforma pages: toolbar, money line,
// tabs. The Inspector's metadata moved into the summary bar and the
// Details panel — it was restating the status, supplier and dates that
// the header already shows.
export function PurchaseOrderDetail({
  purchaseOrder,
  activities,
  relationships,
  workspaceName,
  logoUrl,
  companyProfile,
  branding,
}: PurchaseOrderDetailProps) {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [tab, setTab] = useHashTab(TAB_VALUES, "items");

  const fmtPo = (value: number) => formatCurrency(value);
  const poSettings = {
    dpp_numerator: purchaseOrder.dpp_numerator,
    dpp_denominator: purchaseOrder.dpp_denominator,
    ppn_percent: purchaseOrder.ppn_percent,
    pph_percent: purchaseOrder.pph_percent,
    retensi_percent: purchaseOrder.retensi_percent,
    show_dpp: purchaseOrder.show_dpp,
  };
  const poBreakdown = computeTaxBreakdown(
    purchaseOrder.subtotal - purchaseOrder.discount_amount,
    poSettings
  );
  const hasNotes = !!(
    purchaseOrder.notes || purchaseOrder.terms_and_conditions
  );

  function handleCopyNumber() {
    navigator.clipboard.writeText(purchaseOrder.po_number);
    toast("PO number copied", "success");
  }

  // Sits beside the number wherever the number ends up: in the
  // subtitle when the document has its own title, otherwise next to
  // the heading, which is the number itself.
  const copyNumberButton = (
    <button
      type="button"
      onClick={handleCopyNumber}
      title="Copy PO number"
      className="text-muted-foreground/70 hover:text-foreground"
    >
      <Copy className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <>
      {/* print:hidden so the on-screen layout doesn't print alongside the
          document view below it. */}
      <div className="space-y-4 print:hidden">
        <DocumentToolbar
          backHref={`/${workspace.slug}/purchase-orders`}
          backLabel="Back to Purchase Orders"
          title={purchaseOrder.title || purchaseOrder.po_number}
          badges={
            <>
              {!purchaseOrder.title && copyNumberButton}
              <StatusBadge status={purchaseOrder.status} />
            </>
          }
          subtitle={
            <>
              {/* The number is the heading when the document has no title of
                  its own — no point printing it twice. */}
              {purchaseOrder.title && (
                <>
                  <span className="font-medium text-foreground/80">
                    {purchaseOrder.po_number}
                  </span>
                  {copyNumberButton}
                  <span aria-hidden>·</span>
                </>
              )}
              <span className="truncate">
                {partyLabel(purchaseOrder.supplier?.name, purchaseOrder.supplier?.company, "Deleted supplier")}
              </span>
              {purchaseOrder.project && (
                <DocumentChip
                  href={`/${workspace.slug}/projects/${purchaseOrder.project.id}`}
                  icon={<Building2 className="h-3 w-3 shrink-0" />}
                >
                  {purchaseOrder.project.code} — {purchaseOrder.project.name}
                </DocumentChip>
              )}
            </>
          }
          actions={
            <>
              {/* Mirrors update_purchase_order (00087): a sent or acknowledged
                  PO can still be revised; goods arriving is what locks it. */}
              {!["cancelled", "partially_received", "received"].includes(
                purchaseOrder.status
              ) && (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/${workspace.slug}/purchase-orders/${purchaseOrder.id}/edit`}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Link>
                </Button>
              )}
              <PrintButton
                size="sm"
                filename={documentFilename(
                  purchaseOrder.po_number,
                  purchaseOrder.supplier?.name ?? "Supplier",
                  formatCurrency(purchaseOrder.total)
                )}
              />
            </>
          }
        />

        <DocumentSummaryBar
          primary={{
            label: "Total",
            value: formatCurrency(purchaseOrder.total),
          }}
          metrics={[
            { label: "Issued", value: formatDate(purchaseOrder.issue_date) },
            {
              label: "Expected",
              value: purchaseOrder.expected_date
                ? formatDate(purchaseOrder.expected_date)
                : "—",
            },
            { label: "Items", value: purchaseOrder.line_items.length },
          ]}
          actions={
            <PurchaseOrderStatusActions purchaseOrder={purchaseOrder} />
          }
        />

        <Tabs value={tab} onValueChange={setTab} className="space-y-3">
          <DocumentTabsList
            value={tab}
            tabs={[
              {
                value: "items",
                label: "Items",
                count: purchaseOrder.line_items.length,
              },
              { value: "activity", label: "Activity" },
            ]}
          />

          <TabsContent value="items" className="mt-0">
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Panel>
                <LineItemsTable lineItems={purchaseOrder.line_items} />

                {hasNotes && (
                  <Collapsible className="mt-4 border-t pt-3">
                    <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
                      <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                      Notes &amp; terms
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 pt-3">
                      {purchaseOrder.notes && (
                        <div
                          className="text-sm [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                          dangerouslySetInnerHTML={{ __html: purchaseOrder.notes }}
                        />
                      )}
                      {purchaseOrder.terms_and_conditions && (
                        <div
                          className={
                            purchaseOrder.notes ? "border-t pt-3" : undefined
                          }
                        >
                          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            Terms &amp; Conditions
                          </p>
                          <p className="mt-1 text-sm">
                            {purchaseOrder.terms_and_conditions}
                          </p>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </Panel>

              <Panel>
                <PanelHeader title="Totals" />
                <TaxBreakdownBlock
                  hargaJual={
                    purchaseOrder.subtotal - purchaseOrder.discount_amount
                  }
                  settings={poSettings}
                  dense
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
              <Panel>
                <PanelHeader title="Linked documents" />
                <PurchaseOrderLinks
                  relationships={relationships}
                  workspaceSlug={workspace.slug}
                />
              </Panel>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <SimplePrintView
        workspaceName={workspaceName}
        logoUrl={logoUrl}
        companyProfile={companyProfile}
        branding={branding}
        documentLabel="Purchase Order"
        showSignature={purchaseOrder.show_signature}
        party={{
          heading: "Supplier",
          name: purchaseOrder.supplier?.name ?? "Deleted supplier",
          lines: [
            purchaseOrder.supplier?.company,
            purchaseOrder.supplier?.email,
            purchaseOrder.supplier?.phone,
          ],
        }}
        meta={[
          {
            label: "Issue Date",
            value: new Date(purchaseOrder.issue_date).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }),
          },
          { label: "PO Number", value: purchaseOrder.po_number },
        ]}
        lines={purchaseOrder.line_items}
        totalRows={taxTotalRows(poBreakdown, poSettings, fmtPo)}
        total={{ label: "Total", value: fmtPo(poBreakdown.total) }}
        notes={purchaseOrder.notes}
        terms={purchaseOrder.terms_and_conditions}
      />
    </>
  );
}
