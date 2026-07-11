import { createClient } from "@/lib/supabase/server";
import type {
  ClientSummary,
  CurrencyAmount,
  InvoiceSummary,
  LeadSummary,
  RevenueSummary,
} from "@/features/dashboard/types";

// Mirrors the invoice lifecycle's non-terminal, awaiting-payment statuses
// (see src/features/invoices/types.ts's INVOICE_STATUSES) — draft/paid/
// cancelled/refunded are excluded since they aren't "open" in the
// operational sense this dashboard cares about.
const OPEN_INVOICE_STATUSES = ["sent", "viewed", "partial", "overdue"];

function sumByCurrency(
  rows: { currency: string; amount: number }[]
): CurrencyAmount[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.amount);
  }
  return Array.from(totals, ([currency, amount]) => ({ currency, amount }));
}

/**
 * Lead counts by status. PostgREST has no server-side GROUP BY without an
 * RPC/view (out of scope for this phase), so this selects only the
 * `status` column — no other row data — and reduces in JS. For CRM-scale
 * lead volume this is a single small round trip, not a per-status query.
 */
export async function getLeadSummary(workspaceId: string): Promise<LeadSummary> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("status")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  const byStatus: Record<string, number> = {};
  for (const row of data ?? []) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  }

  return { total: data?.length ?? 0, byStatus };
}

/**
 * Active client count only — a head-only count query (no rows returned),
 * the cheapest possible shape for a plain count.
 */
export async function getClientSummary(workspaceId: string): Promise<ClientSummary> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("clients")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  return { activeCount: count ?? 0 };
}

/**
 * Open-invoice count (via the same query's exact count, no second
 * round trip) plus outstanding amount_due, grouped by currency since
 * invoices can carry different currencies and there's no exchange-rate
 * table to convert between them. Only `currency`/`amount_due` are
 * selected — never a full invoice row.
 */
export async function getInvoiceSummary(
  workspaceId: string
): Promise<InvoiceSummary> {
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("invoices")
    .select("currency, amount_due", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .in("status", OPEN_INVOICE_STATUSES);

  return {
    openCount: count ?? 0,
    amountDueByCurrency: sumByCurrency(
      (data ?? []).map((row) => ({ currency: row.currency, amount: row.amount_due }))
    ),
  };
}

/**
 * This-month payments total, grouped by currency for the same reason as
 * getInvoiceSummary. Only `currency`/`amount` are selected.
 */
export async function getRevenueSummary(
  workspaceId: string
): Promise<RevenueSummary> {
  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  )
    .toISOString()
    .slice(0, 10);

  const { data } = await supabase
    .from("payments")
    .select("currency, amount")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .gte("payment_date", monthStart);

  return { totalByCurrency: sumByCurrency(data ?? []) };
}
