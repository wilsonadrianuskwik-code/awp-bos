import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { MetricsRibbon } from "@/components/shared/metrics-ribbon";
import { QuotationListPage } from "@/features/quotations/components/quotation-list-page";
import { getQuotations, getQuotationStats } from "@/features/quotations/queries";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { formatCurrencyAmounts } from "@/lib/utils/format-currency";
import {
  QUOTATION_STATUSES,
  type QuotationFilters,
  type QuotationStatus,
} from "@/features/quotations/types";

const SORT_FIELDS = ["created_at", "total", "expiry_date"] as const;

function parseFilters(params: {
  q?: string;
  status?: string;
  sort?: string;
  page?: string;
  clientId?: string;
}): QuotationFilters {
  const [sortBy, sortDir] = (params.sort ?? "created_at:desc").split(":");

  return {
    search: params.q || undefined,
    status: QUOTATION_STATUSES.includes(params.status as QuotationStatus)
      ? (params.status as QuotationStatus)
      : "all",
    clientId: params.clientId || undefined,
    sortBy: SORT_FIELDS.includes(sortBy as (typeof SORT_FIELDS)[number])
      ? (sortBy as QuotationFilters["sortBy"])
      : "created_at",
    sortDir: sortDir === "asc" ? "asc" : "desc",
    page: Math.max(1, Number(params.page ?? "1") || 1),
    pageSize: 20,
  };
}

export default async function QuotationsPage({
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
  const [{ quotations, count }, stats] = await Promise.all([
    getQuotations(workspace.id, filters),
    getQuotationStats(workspace.id),
  ]);

  const hasAnyFilters =
    !!filters.search ||
    (filters.status && filters.status !== "all") ||
    !!filters.clientId;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotations"
        description="Create, send, and track quotations"
        action={
          <Button asChild>
            <Link href={`/${workspaceSlug}/quotations/new`}>
              <Plus className="mr-2 h-4 w-4" />
              New Quotation
            </Link>
          </Button>
        }
      />

      {count === 0 && !hasAnyFilters ? (
        <EmptyState
          icon={FileText}
          title="No quotations yet"
          description="Create your first quotation to start closing deals."
          action={
            <Button asChild>
              <Link href={`/${workspaceSlug}/quotations/new`}>
                <Plus className="mr-2 h-4 w-4" />
                New Quotation
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <MetricsRibbon
            metrics={[
              { label: "Total Quotations", value: String(stats.totalCount) },
              { label: "Draft", value: String(stats.draftCount) },
              {
                label: "Awaiting Approval",
                value: String(stats.awaitingApprovalCount),
                description: "Sent or viewed",
              },
              { label: "Approved", value: String(stats.approvedCount) },
              {
                label: "Total Value",
                value: formatCurrencyAmounts(
                  stats.totalValueByCurrency,
                  workspace.default_currency
                ),
              },
            ]}
          />
          <QuotationListPage quotations={quotations} count={count} />
        </>
      )}
    </div>
  );
}
