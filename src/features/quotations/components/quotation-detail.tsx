"use client";

import { useState } from "react";
import { Copy, GitCompare, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { BackButton } from "@/components/shared/back-button";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { QuotationLifecycleTimeline } from "./quotation-lifecycle-timeline";
import { LineItemsTable } from "@/features/line-items/components/line-items-table";
import { QuotationStatusActions } from "./quotation-status-actions";
import { QuotationVersionHistory } from "./quotation-version-history";
import { QuotationVersionDiffDialog } from "./quotation-version-diff-dialog";
import { GenerateInvoiceDialog } from "./generate-invoice-dialog";
import { QuotationPortalAccessCard } from "./quotation-portal-access-card";
import { PricingSummary } from "@/features/line-items/components/pricing-summary";
import { QuotationPrintView } from "./quotation-print-view";
import type {
  QuotationDetail as QuotationDetailType,
  QuotationWithClient,
} from "@/features/quotations/types";
import type { Activity } from "@/features/activities/types";

type QuotationDetailProps = {
  quotation: QuotationDetailType;
  activities: Activity[];
  versions: QuotationWithClient[];
  previousVersion: QuotationDetailType | null;
  workspaceName: string;
};

export function QuotationDetail({
  quotation,
  activities,
  versions,
  previousVersion,
  workspaceName,
}: QuotationDetailProps) {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [generateInvoiceOpen, setGenerateInvoiceOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);

  function handlePrint() {
    window.print();
  }

  function handleCopyNumber() {
    navigator.clipboard.writeText(quotation.quotation_number);
    toast("Quotation number copied", "success");
  }

  return (
    <div>
      <div className="space-y-6 print:hidden">
        <BackButton href={`/${workspace.slug}/quotations`} label="Back to Quotations" />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {quotation.title || quotation.quotation_number}
              </h1>
              {quotation.version > 1 && (
                <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-medium text-muted-foreground">
                  V{quotation.version}
                </span>
              )}
              <StatusBadge status={quotation.status} />
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              {quotation.quotation_number} · {quotation.client.name}
              {quotation.client.company ? ` · ${quotation.client.company}` : ""}
              <button
                type="button"
                onClick={handleCopyNumber}
                title="Copy quotation number"
                className="text-muted-foreground/70 hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {previousVersion && (
              <Button variant="outline" size="sm" onClick={() => setDiffOpen(true)}>
                <GitCompare className="mr-2 h-4 w-4" />
                Compare with V{previousVersion.version}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </div>
        </div>

        <QuotationStatusActions
          quotation={quotation}
          onGenerateInvoice={() => setGenerateInvoiceOpen(true)}
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
          </div>
        </div>
      </div>

      <QuotationPrintView quotation={quotation} workspaceName={workspaceName} />

      <GenerateInvoiceDialog
        open={generateInvoiceOpen}
        onOpenChange={setGenerateInvoiceOpen}
        quotation={quotation}
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
