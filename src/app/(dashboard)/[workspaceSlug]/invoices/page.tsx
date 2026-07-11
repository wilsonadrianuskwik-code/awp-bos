import Link from "next/link";
import { notFound } from "next/navigation";
import { Receipt, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { InvoiceListPage } from "@/features/invoices/components/invoice-list-page";
import { getInvoices } from "@/features/invoices/queries";
import { checkOverdueInvoices } from "@/features/invoices/actions";
import { getWorkspaceBySlug } from "@/lib/workspace";
import {
  INVOICE_STATUSES,
  type InvoiceFilters,
  type InvoiceStatus,
} from "@/features/invoices/types";

const SORT_FIELDS = ["created_at", "total", "due_date"] as const;

function parseFilters(params: {
  q?: string;
  status?: string;
  sort?: string;
  page?: string;
  clientId?: string;
}): InvoiceFilters {
  const [sortBy, sortDir] = (params.sort ?? "created_at:desc").split(":");

  return {
    search: params.q || undefined,
    status: INVOICE_STATUSES.includes(params.status as InvoiceStatus)
      ? (params.status as InvoiceStatus)
      : "all",
    clientId: params.clientId || undefined,
    sortBy: SORT_FIELDS.includes(sortBy as (typeof SORT_FIELDS)[number])
      ? (sortBy as InvoiceFilters["sortBy"])
      : "created_at",
    sortDir: sortDir === "asc" ? "asc" : "desc",
    page: Math.max(1, Number(params.page ?? "1") || 1),
    pageSize: 20,
  };
}

export default async function InvoicesPage({
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

  await checkOverdueInvoices(workspace.id);

  const filters = parseFilters(search);
  const { invoices, count } = await getInvoices(workspace.id, filters);

  const hasAnyFilters =
    !!filters.search ||
    (filters.status && filters.status !== "all") ||
    !!filters.clientId;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Bill clients and track payments"
        action={
          <Button asChild>
            <Link href={`/${workspaceSlug}/invoices/new`}>
              <Plus className="mr-2 h-4 w-4" />
              New Invoice
            </Link>
          </Button>
        }
      />

      {count === 0 && !hasAnyFilters ? (
        <EmptyState
          icon={Receipt}
          title="No invoices yet"
          description="Create your first invoice to start getting paid."
          action={
            <Button asChild>
              <Link href={`/${workspaceSlug}/invoices/new`}>
                <Plus className="mr-2 h-4 w-4" />
                New Invoice
              </Link>
            </Button>
          }
        />
      ) : (
        <InvoiceListPage invoices={invoices} count={count} />
      )}
    </div>
  );
}
