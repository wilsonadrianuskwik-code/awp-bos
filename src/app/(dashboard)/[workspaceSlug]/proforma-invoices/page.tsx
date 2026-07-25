import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { MetricsRibbon } from "@/components/shared/metrics-ribbon";
import { ProformaInvoiceListPage } from "@/features/proforma-invoices/components/proforma-invoice-list-page";
import {
  getProformaInvoices,
  getProformaInvoiceStats,
} from "@/features/proforma-invoices/queries";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { formatCurrencyAmounts } from "@/lib/utils/format-currency";
import {
  PROFORMA_INVOICE_STATUSES,
  type ProformaInvoiceFilters,
  type ProformaInvoiceStatus,
} from "@/features/proforma-invoices/types";

const SORT_FIELDS = ["created_at", "total", "expiry_date"] as const;

function parseFilters(params: {
  q?: string;
  status?: string;
  sort?: string;
  page?: string;
  clientId?: string;
}): ProformaInvoiceFilters {
  const [sortBy, sortDir] = (params.sort ?? "created_at:desc").split(":");

  return {
    search: params.q || undefined,
    status: PROFORMA_INVOICE_STATUSES.includes(params.status as ProformaInvoiceStatus)
      ? (params.status as ProformaInvoiceStatus)
      : "all",
    clientId: params.clientId || undefined,
    sortBy: SORT_FIELDS.includes(sortBy as (typeof SORT_FIELDS)[number])
      ? (sortBy as ProformaInvoiceFilters["sortBy"])
      : "created_at",
    sortDir: sortDir === "asc" ? "asc" : "desc",
    page: Math.max(1, Number(params.page ?? "1") || 1),
    pageSize: 20,
  };
}

export default async function ProformaInvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{
    q?: string;
    status?: string;
    sort?: string;
    page?: string;
    clientId?: string;
  }>;
}) {
  const [{ workspaceSlug }, search] = await Promise.all([params, searchParams]);
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const filters = parseFilters(search);
  const [{ proformaInvoices, count }, stats] = await Promise.all([
    getProformaInvoices(workspace.id, filters),
    getProformaInvoiceStats(workspace.id),
  ]);

  const hasAnyFilters =
    !!filters.search || (filters.status && filters.status !== "all") || !!filters.clientId;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proforma Invoices"
        description="Create, send, and track proforma invoices"
        action={
          <Button asChild>
            <Link href={`/${workspaceSlug}/proforma-invoices/new`}>
              <Plus className="mr-2 h-4 w-4" />
              New Proforma Invoice
            </Link>
          </Button>
        }
      />

      {count === 0 && !hasAnyFilters ? (
        <EmptyState
          icon={FileText}
          title="No proforma invoices yet"
          description="Create your first proforma invoice, or generate one from an approved quotation."
          action={
            <Button asChild>
              <Link href={`/${workspaceSlug}/proforma-invoices/new`}>
                <Plus className="mr-2 h-4 w-4" />
                New Proforma Invoice
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <MetricsRibbon
            metrics={[
              { label: "Total", value: String(stats.totalCount) },
              { label: "Draft", value: String(stats.draftCount) },
              { label: "Sent", value: String(stats.sentCount) },
              { label: "Accepted", value: String(stats.acceptedCount) },
              {
                label: "Total Value",
                value: formatCurrencyAmounts(
                  stats.totalValueByCurrency,
                  workspace.default_currency
                ),
              },
            ]}
          />
          <ProformaInvoiceListPage proformaInvoices={proformaInvoices} count={count} />
        </>
      )}
    </div>
  );
}
