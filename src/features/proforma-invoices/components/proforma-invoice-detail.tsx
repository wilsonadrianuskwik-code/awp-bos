"use client";

import Link from "next/link";
import { ChevronDown, Copy, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { StatusBadge } from "@/components/shared/status-badge";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { DocumentAuditCard } from "@/features/activities/components/document-audit-card";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { LineItemsTable } from "@/features/line-items/components/line-items-table";
import { GenerateDocumentMenu } from "@/features/documents/components/generate-document-menu";
import { LinkedDocumentsList } from "@/features/documents/components/linked-documents-card";
import { TaxSettingsPanel } from "@/features/documents/components/tax-settings-panel";
import { SimplePrintView } from "@/features/documents/components/simple-print-view";
import { computeTaxBreakdown, taxTotalRows } from "@/features/documents/tax";
import {
  documentFilename,
  PrintButton,
} from "@/features/documents/components/print-button";
import {
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
import { ProformaInvoiceStatusActions } from "./proforma-invoice-status-actions";
import { isEditableStatus } from "@/features/proforma-invoices/helpers";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatDate } from "@/lib/utils/date";
import type { ProformaInvoiceDetail as ProformaInvoiceDetailType } from "@/features/proforma-invoices/types";
import type { DocumentLink } from "@/features/documents/queries";
import type { Activity } from "@/features/activities/types";
import type {
  BrandingSettings,
  CompanyProfile,
  PaymentDetails,
} from "@/features/templates/types";

type ProformaInvoiceDetailProps = {
  proformaInvoice: ProformaInvoiceDetailType;
  activities: Activity[];
  links: DocumentLink[];
  /** Company branding for the printable view. */
  workspaceName: string;
  logoUrl?: string | null;
  companyProfile?: CompanyProfile;
  branding?: BrandingSettings;
  paymentDetails?: PaymentDetails;
};

const TAB_VALUES = ["items", "activity"];

export function ProformaInvoiceDetail({
  proformaInvoice,
  activities,
  links,
  workspaceName,
  logoUrl,
  companyProfile,
  branding,
  paymentDetails,
}: ProformaInvoiceDetailProps) {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [tab, setTab] = useHashTab(TAB_VALUES, "items");

  function handleCopyNumber() {
    navigator.clipboard.writeText(proformaInvoice.pi_number);
    toast("Proforma invoice number copied", "success");
  }

  const canGenerateInvoice =
    proformaInvoice.status === "accepted" && !proformaInvoice.generated_invoice_id;

  const fmtPi = (value: number) => formatCurrency(value);
  const piSettings = {
    dpp_numerator: proformaInvoice.dpp_numerator,
    dpp_denominator: proformaInvoice.dpp_denominator,
    ppn_percent: proformaInvoice.ppn_percent,
    pph_percent: proformaInvoice.pph_percent,
    retensi_percent: proformaInvoice.retensi_percent,
    show_dpp: proformaInvoice.show_dpp,
  };
  const piBreakdown = computeTaxBreakdown(
    proformaInvoice.subtotal - proformaInvoice.discount_amount,
    piSettings
  );
  const piTotalRows = taxTotalRows(piBreakdown, piSettings, fmtPi);
  const hasNotes = !!(
    proformaInvoice.notes || proformaInvoice.terms_and_conditions
  );

  // Sits beside the number wherever the number ends up: in the
  // subtitle when the document has its own title, otherwise next to
  // the heading, which is the number itself.
  const copyNumberButton = (
    <button
      type="button"
      onClick={handleCopyNumber}
      title="Copy proforma invoice number"
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
          backHref={`/${workspace.slug}/proforma-invoices`}
          backLabel="Back to Proforma Invoices"
          title={proformaInvoice.title || proformaInvoice.pi_number}
          badges={
            <>
              {!proformaInvoice.title && copyNumberButton}
              <StatusBadge status={proformaInvoice.status} />
            </>
          }
          subtitle={
            <>
              {/* The number is the heading when the document has no title of
                  its own — no point printing it twice. */}
              {proformaInvoice.title && (
                <>
                  <span className="font-medium text-foreground/80">
                    {proformaInvoice.pi_number}
                  </span>
                  {copyNumberButton}
                  <span aria-hidden>·</span>
                </>
              )}
              <span className="truncate">
                {partyLabel(proformaInvoice.client?.name, proformaInvoice.client?.company, "Deleted client")}
              </span>
            </>
          }
          actions={
            <>
              {canGenerateInvoice && (
                <GenerateDocumentMenu
                  fromType="proforma_invoice"
                  fromId={proformaInvoice.id}
                  targets={[
                    { toType: "invoice", label: "Invoice", routeSegment: "invoices" },
                  ]}
                />
              )}
              {isEditableStatus(proformaInvoice.status) && (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/${workspace.slug}/proforma-invoices/${proformaInvoice.id}/edit`}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Link>
                </Button>
              )}
              <PrintButton
                size="sm"
                filename={documentFilename(
                  proformaInvoice.pi_number,
                  proformaInvoice.client?.name ?? "Client",
                  formatCurrency(proformaInvoice.total)
                )}
              />
            </>
          }
        />

        <DocumentSummaryBar
          primary={{
            label: "Total",
            value: formatCurrency(proformaInvoice.total),
          }}
          metrics={[
            {
              label: "Issued",
              value: formatDate(proformaInvoice.issue_date),
            },
            {
              label: "Items",
              value: proformaInvoice.line_items.length,
            },
          ]}
          actions={
            <ProformaInvoiceStatusActions proformaInvoice={proformaInvoice} />
          }
        />

        <Tabs value={tab} onValueChange={setTab} className="space-y-3">
          <DocumentTabsList
            value={tab}
            tabs={[
              {
                value: "items",
                label: "Items",
                count: proformaInvoice.line_items.length,
              },
              { value: "activity", label: "Activity" },
            ]}
          />

          <TabsContent value="items" className="mt-0">
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
              <Panel>
                <LineItemsTable lineItems={proformaInvoice.line_items} />

                {hasNotes && (
                  <Collapsible className="mt-4 border-t pt-3">
                    <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
                      <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                      Notes &amp; terms
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 pt-3">
                      {proformaInvoice.notes && (
                        <div
                          className="text-sm [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                          dangerouslySetInnerHTML={{
                            __html: proformaInvoice.notes,
                          }}
                        />
                      )}
                      {proformaInvoice.terms_and_conditions && (
                        <div
                          className={
                            proformaInvoice.notes ? "border-t pt-3" : undefined
                          }
                        >
                          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            Terms &amp; Conditions
                          </p>
                          <div
                            className="mt-1 text-sm [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                            dangerouslySetInnerHTML={{
                              __html: proformaInvoice.terms_and_conditions,
                            }}
                          />
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </Panel>

              {/* Edited in place, like the invoice — see InvoiceDetail. */}
              <Panel>
                <PanelHeader
                  title="Totals"
                  hint={
                    isEditableStatus(proformaInvoice.status)
                      ? undefined
                      : "Locked — an issued document keeps the rates it was issued under."
                  }
                />
                <TaxSettingsPanel
                  workspaceId={workspace.id}
                  documentType="proforma_invoice"
                  documentId={proformaInvoice.id}
                  hargaJual={
                    proformaInvoice.subtotal - proformaInvoice.discount_amount
                  }
                  settings={piSettings}
                  editable={isEditableStatus(proformaInvoice.status)}
                />
              </Panel>

              <Panel>
                <PanelHeader title="Record" />
                <DocumentAuditCard
                  activities={activities}
                  createdAt={proformaInvoice.created_at}
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

      <SimplePrintView
        workspaceName={workspaceName}
        logoUrl={logoUrl}
        companyProfile={companyProfile}
        branding={branding}
        paymentDetails={paymentDetails}
        documentLabel="Proforma Invoice"
        showSignature={proformaInvoice.show_signature}
        party={{
          heading: "Bill To",
          name: proformaInvoice.client?.name ?? "Deleted client",
          lines: [
            proformaInvoice.client?.company,
            proformaInvoice.client?.email,
          ],
        }}
        meta={[
          {
            label: "Issue Date",
            value: new Date(proformaInvoice.issue_date).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }),
          },
          { label: "PI Number", value: proformaInvoice.pi_number },
        ]}
        lines={proformaInvoice.line_items}
        totalRows={piTotalRows}
        total={{ label: "Total", value: fmtPi(piBreakdown.total) }}
        notes={proformaInvoice.notes}
        terms={proformaInvoice.terms_and_conditions}
      />
    </>
  );
}
