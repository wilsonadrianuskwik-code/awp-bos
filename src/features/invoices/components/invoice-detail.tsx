"use client";

import { useState } from "react";
import { Copy, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { BackButton } from "@/components/shared/back-button";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { LineItemsTable } from "@/features/line-items/components/line-items-table";
import { InvoiceStatusActions } from "@/features/invoices/components/invoice-status-actions";
import { RecordPaymentDialog } from "@/features/invoices/components/record-payment-dialog";
import { PaymentHistory } from "@/features/invoices/components/payment-history";
import { OutstandingBalanceCard } from "@/features/invoices/components/outstanding-balance-card";
import { InvoicePortalAccessCard } from "@/features/invoices/components/invoice-portal-access-card";
import { InvoicePrintView } from "@/features/invoices/components/invoice-print-view";
import { InvoiceFulfillmentSection } from "@/features/fulfillment/components/invoice-fulfillment-section";
import { DocumentRenderView } from "@/features/templates/renderer/components/document-render-view";
import { invoiceToRenderData } from "@/features/templates/renderer/adapters";
import { formatCurrency } from "@/lib/utils/format-currency";
import { getOverdueDays } from "@/lib/utils/date";
import type { InvoiceDetail as InvoiceDetailType } from "@/features/invoices/types";
import type { Activity } from "@/features/activities/types";
import type { FulfillmentItemWithProgress } from "@/features/fulfillment/types";
import type { DocumentTemplateWithTheme, CompanyProfile } from "@/features/templates/types";

type InvoiceDetailProps = {
  invoice: InvoiceDetailType;
  activities: Activity[];
  workspace: { name: string; logo_url: string | null; settings?: { company_profile?: CompanyProfile } | null };
  fulfillmentItems: FulfillmentItemWithProgress[];
  template: DocumentTemplateWithTheme | null;
};

export function InvoiceDetail({
  invoice,
  activities,
  workspace: workspaceInfo,
  fulfillmentItems,
  template,
}: InvoiceDetailProps) {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);

  function handlePrint() {
    const clientName = invoice.client?.name ?? "Client";
    const total = formatCurrency(invoice.total ?? 0, invoice.currency);
    const filename = sanitizeFilename(`${clientName} - ${invoice.invoice_number} - ${total}`);
    const prevTitle = document.title;
    document.title = filename;
    window.print();
    document.title = prevTitle;
  }

  function handleCopyNumber() {
    navigator.clipboard.writeText(invoice.invoice_number);
    toast("Invoice number copied", "success");
  }

  return (
    <div>
      <div className="space-y-6 print:hidden">
        <BackButton href={`/${workspace.slug}/invoices`} label="Back to Invoices" />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                {invoice.title || invoice.invoice_number}
              </h1>
              <StatusBadge
                status={invoice.status}
                label={
                  invoice.status === "overdue" && invoice.due_date
                    ? `Overdue • ${getOverdueDays(invoice.due_date)} days`
                    : undefined
                }
              />
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              {invoice.invoice_number} · {invoice.client.name}
              {invoice.client.company ? ` · ${invoice.client.company}` : ""}
              <button
                type="button"
                onClick={handleCopyNumber}
                title="Copy invoice number"
                className="text-muted-foreground/70 hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </div>
        </div>

        <InvoiceStatusActions
          invoice={invoice}
          onRecordPayment={() => setRecordPaymentOpen(true)}
        />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Line Items</CardTitle>
              </CardHeader>
              <CardContent>
                <LineItemsTable
                  lineItems={invoice.line_items}
                  currency={invoice.currency}
                />
              </CardContent>
            </Card>

            {invoice.notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className="text-sm [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                    dangerouslySetInnerHTML={{ __html: invoice.notes }}
                  />
                </CardContent>
              </Card>
            )}

            {invoice.payment_terms && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Payment Terms</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{invoice.payment_terms}</p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <PaymentHistory payments={invoice.payments} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Fulfillment</CardTitle>
              </CardHeader>
              <CardContent>
                <InvoiceFulfillmentSection
                  invoiceStatus={invoice.status}
                  lineItems={invoice.line_items}
                  fulfillmentItems={fulfillmentItems}
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

          <div className="space-y-6">
            <OutstandingBalanceCard invoice={invoice} />

            <InvoicePortalAccessCard invoice={invoice} />
          </div>
        </div>
      </div>

      <DocumentRenderView
        template={template}
        data={invoiceToRenderData(invoice, workspaceInfo)}
        fallback={<InvoicePrintView invoice={invoice} workspaceName={workspaceInfo.name} />}
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
