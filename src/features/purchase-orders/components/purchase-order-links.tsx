import Link from "next/link";
import { FileText, Truck, Receipt, FileSpreadsheet } from "lucide-react";
import type { DocumentRelationship } from "@/features/purchase-orders/types";

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

/**
 * The PO's traceability chain as chips.
 *
 * Was the body of PurchaseOrderInspector, a sticky right-rail card that
 * also repeated status, supplier, project and both dates — all of which
 * the toolbar and summary bar now state once, at the top. What was left
 * that appears nowhere else is this: what the PO came from and what it
 * produced.
 */
export function PurchaseOrderLinks({
  relationships,
  workspaceSlug,
}: {
  relationships: DocumentRelationship[];
  workspaceSlug: string;
}) {
  if (relationships.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No linked documents yet.</p>
    );
  }

  return (
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
  );
}
