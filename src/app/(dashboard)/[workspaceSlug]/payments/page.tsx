import { notFound } from "next/navigation";
import { CreditCard } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaymentsList } from "@/features/payments/components/payments-list";
import { getPayments } from "@/features/payments/queries";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { PAYMENT_METHODS, type PaymentMethod } from "@/features/invoices/types";
import type { PaymentFilters } from "@/features/payments/types";

function parseFilters(params: {
  q?: string;
  from?: string;
  to?: string;
  currency?: string;
  method?: string;
}): PaymentFilters {
  return {
    search: params.q || undefined,
    from: params.from || undefined,
    to: params.to || undefined,
    currency: params.currency || undefined,
    method: PAYMENT_METHODS.includes(params.method as PaymentMethod)
      ? (params.method as PaymentMethod)
      : "all",
  };
}

export default async function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{
    q?: string;
    from?: string;
    to?: string;
    currency?: string;
    method?: string;
  }>;
}) {
  const [{ workspaceSlug }, search] = await Promise.all([params, searchParams]);
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const filters = parseFilters(search);
  const payments = await getPayments(workspace.id, filters);

  const hasAnyFilters =
    !!filters.search || !!filters.from || !!filters.to || !!filters.currency ||
    (filters.method && filters.method !== "all");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Every payment recorded across your workspace"
      />

      {payments.length === 0 && !hasAnyFilters ? (
        <EmptyState
          icon={CreditCard}
          title="No payments recorded yet"
          description="Payments recorded against an invoice will show up here."
        />
      ) : (
        <PaymentsList payments={payments} />
      )}
    </div>
  );
}
