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
import { ProformaInvoiceStatusActions } from "./proforma-invoice-status-actions";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { ProformaInvoiceDetail as ProformaInvoiceDetailType, DocumentRelationship } from "@/features/proforma-invoices/types";
import type { Activity } from "@/features/activities/types";

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
  relationships: DocumentRelationship[];
};

export function ProformaInvoiceDetail({
  proformaInvoice,
  activities,
  relationships,
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
    <div className="space-y-6">
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
          canGenerateInvoice ? (
            <GenerateDocumentMenu
              fromType="proforma_invoice"
              fromId={proformaInvoice.id}
              targets={[
                { toType: "invoice", label: "Invoice", routeSegment: "invoices" },
              ]}
            />
          ) : undefined
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
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Linked Documents</CardTitle>
            </CardHeader>
            <CardContent>
              {relationships.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No linked documents yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {relationships.map((rel) => (
                    <li key={`${rel.direction}-${rel.related_type}-${rel.related_id}`}>
                      <Link
                        href={`/${workspace.slug}/${ROUTE_SEGMENT[rel.related_type] ?? rel.related_type}/${rel.related_id}`}
                        className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                      >
                        <span>
                          {rel.direction === "generated_to" ? "Generated " : "Generated from "}
                          {DOCUMENT_LABEL[rel.related_type] ?? rel.related_type}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
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
  );
}
