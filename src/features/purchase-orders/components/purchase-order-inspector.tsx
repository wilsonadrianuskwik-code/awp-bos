import Link from "next/link";
import { FileText, Truck, Receipt, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import type {
  DocumentRelationship,
  PurchaseOrderDetail,
} from "@/features/purchase-orders/types";

function formatDate(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const DOC_TYPE_LABEL: Record<string, string> = {
  quotation: "Quotation",
  proforma_invoice: "Proforma Invoice",
  invoice: "Invoice",
  purchase_order: "Purchase Order",
  delivery_order: "Delivery Order",
  payment: "Payment",
};

const DOC_TYPE_ICON: Record<string, typeof FileText> = {
  quotation: FileSpreadsheet,
  proforma_invoice: FileText,
  invoice: Receipt,
  purchase_order: FileText,
  delivery_order: Truck,
  payment: Receipt,
};

// Route slug for each document type — the traceability chips need to link
// somewhere; every type in document_type_registry has (or will have) a
// list/detail route under the workspace, mirroring how invoices/
// quotations already resolve their own hrefs.
const DOC_TYPE_ROUTE: Record<string, string> = {
  quotation: "quotations",
  proforma_invoice: "proforma-invoices",
  invoice: "invoices",
  purchase_order: "purchase-orders",
  delivery_order: "delivery-orders",
};

type PurchaseOrderInspectorProps = {
  purchaseOrder: PurchaseOrderDetail;
  relationships: DocumentRelationship[];
  workspaceSlug: string;
};

// A distinct, visually-separated right-rail panel — previews the
// "Inspector" layout pattern the Document Engine's other new types
// (proforma invoices, delivery orders) will reuse. Deliberately simple: a
// sticky aside with metadata + the traceability chain, not a new
// interaction model.
export function PurchaseOrderInspector({
  purchaseOrder,
  relationships,
  workspaceSlug,
}: PurchaseOrderInspectorProps) {
  return (
    <Card className="border-primary/15 bg-muted/20 lg:sticky lg:top-6">
      <CardHeader>
        <CardTitle className="text-base">Inspector</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Metadata
          </p>
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <StatusBadge status={purchaseOrder.status} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Supplier</dt>
              <dd className="truncate text-right font-medium">
                {purchaseOrder.supplier?.name ?? "Deleted supplier"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Project</dt>
              <dd className="truncate text-right font-medium">
                {purchaseOrder.project
                  ? `${purchaseOrder.project.code} · ${purchaseOrder.project.name}`
                  : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Issue date</dt>
              <dd>{formatDate(purchaseOrder.issue_date)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Expected date</dt>
              <dd>{formatDate(purchaseOrder.expected_date)}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-3 border-t pt-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Linked Documents
          </p>
          {relationships.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No linked documents yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {relationships.map((rel) => {
                const Icon = DOC_TYPE_ICON[rel.related_type] ?? FileText;
                const route = DOC_TYPE_ROUTE[rel.related_type];
                const label = DOC_TYPE_LABEL[rel.related_type] ?? rel.related_type;
                const chip = (
                  <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted">
                    <Icon className="h-3 w-3" />
                    {label}
                    <span className="text-muted-foreground">
                      {rel.direction === "generated_from" ? "(source)" : "(generated)"}
                    </span>
                  </span>
                );
                return route ? (
                  <Link
                    key={`${rel.direction}-${rel.related_id}`}
                    href={`/${workspaceSlug}/${route}/${rel.related_id}`}
                  >
                    {chip}
                  </Link>
                ) : (
                  <span key={`${rel.direction}-${rel.related_id}`}>{chip}</span>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
