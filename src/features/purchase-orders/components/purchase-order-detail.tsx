"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { DetailHeader } from "@/components/shared/detail-header";
import { LineItemsTable } from "@/features/line-items/components/line-items-table";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { PurchaseOrderStatusActions } from "@/features/purchase-orders/components/purchase-order-status-actions";
import { PurchaseOrderInspector } from "@/features/purchase-orders/components/purchase-order-inspector";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { formatCurrency } from "@/lib/utils/format-currency";
import type {
  DocumentRelationship,
  PurchaseOrderDetail as PurchaseOrderDetailType,
} from "@/features/purchase-orders/types";
import type { Activity } from "@/features/activities/types";
import type { BrandingSettings, CompanyProfile } from "@/features/templates/types";
import { SimplePrintView } from "@/features/documents/components/simple-print-view";
import { PrintButton } from "@/features/documents/components/print-button";

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

// Mirrors InvoiceDetail's structure (line items + notes/terms on the
// left, activity on the right) with one addition: the Inspector panel,
// a distinct visually-separated right-rail column previewing the layout
// pattern every other new Document Engine type will reuse.
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

  function handleCopyNumber() {
    navigator.clipboard.writeText(purchaseOrder.po_number);
    toast("PO number copied", "success");
  }

  return (
    <>
      {/* print:hidden so the on-screen layout doesn't print alongside the
          document view below it. */}
      <div className="space-y-6 print:hidden">
      <DetailHeader
        backHref={`/${workspace.slug}/purchase-orders`}
        backLabel="Back to Purchase Orders"
        title={purchaseOrder.title || purchaseOrder.po_number}
        badges={<StatusBadge status={purchaseOrder.status} />}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {purchaseOrder.po_number}
            · {purchaseOrder.supplier?.name ?? "Deleted supplier"}
            {purchaseOrder.supplier?.company ? ` · ${purchaseOrder.supplier.company}` : ""}
            <button
              type="button"
              onClick={handleCopyNumber}
              title="Copy PO number"
              className="text-muted-foreground/70 hover:text-foreground"
            >
              Copy
            </button>
          </span>
        }
        actions={
          <PrintButton
            filename={`${purchaseOrder.supplier?.name ?? "Supplier"} - ${purchaseOrder.po_number}`}
          />
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Total
            </p>
            <p className="text-3xl font-semibold tabular-nums tracking-tight">
              {formatCurrency(purchaseOrder.total, purchaseOrder.currency)}
            </p>
          </div>
          <PurchaseOrderStatusActions purchaseOrder={purchaseOrder} />
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
                lineItems={purchaseOrder.line_items}
                currency={purchaseOrder.currency}
              />
            </CardContent>
          </Card>

          {(purchaseOrder.notes || purchaseOrder.terms_and_conditions) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes &amp; Terms</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {purchaseOrder.notes && (
                  <div
                    className="text-sm [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                    dangerouslySetInnerHTML={{ __html: purchaseOrder.notes }}
                  />
                )}
                {purchaseOrder.terms_and_conditions && (
                  <div className={purchaseOrder.notes ? "border-t pt-4" : undefined}>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Terms &amp; Conditions
                    </p>
                    <p className="mt-1 text-sm">{purchaseOrder.terms_and_conditions}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline activities={activities} />
            </CardContent>
          </Card>
        </div>

        {/* Inspector: kept as its own visually-distinct column rather than
            folded into the left content — see purchase-order-inspector.tsx. */}
        <div>
          <PurchaseOrderInspector
            purchaseOrder={purchaseOrder}
            relationships={relationships}
            workspaceSlug={workspace.slug}
          />
        </div>
      </div>
      </div>

      <SimplePrintView
        workspaceName={workspaceName}
        logoUrl={logoUrl}
        companyProfile={companyProfile}
        branding={branding}
        documentLabel="Purchase Order"
        documentNumber={purchaseOrder.po_number}
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
          { label: "Issue date", value: new Date(purchaseOrder.issue_date).toLocaleDateString() },
          ...(purchaseOrder.expected_date
            ? [{ label: "Expected", value: new Date(purchaseOrder.expected_date).toLocaleDateString() }]
            : []),
          ...(purchaseOrder.project
            ? [{ label: "Project", value: purchaseOrder.project.code }]
            : []),
        ]}
        title={purchaseOrder.title}
        lines={purchaseOrder.line_items}
        currency={purchaseOrder.currency}
        notes={purchaseOrder.notes}
        terms={purchaseOrder.terms_and_conditions}
      />
    </>
  );
}
