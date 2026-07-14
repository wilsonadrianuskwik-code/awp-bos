import { createClient } from "@/lib/supabase/server";
import type {
  ClientSummary,
  CurrencyAmount,
  InvoiceSummary,
  LeadSummary,
  OverdueSummary,
  RevenueSummary,
  RevenueTrendPoint,
  TopCatalogItem,
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

/**
 * Overdue-invoice amount, grouped by currency — a narrower, more
 * actionable number than getInvoiceSummary's "open" count above (which
 * includes sent/viewed/partial invoices that aren't yet late). Same
 * shape, same sumByCurrency helper, just a single status instead of the
 * broader OPEN_INVOICE_STATUSES set.
 */
export async function getOverdueSummary(
  workspaceId: string
): Promise<OverdueSummary> {
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("invoices")
    .select("currency, amount_due", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .eq("status", "overdue");

  return {
    overdueCount: count ?? 0,
    amountOverdueByCurrency: sumByCurrency(
      (data ?? []).map((row) => ({ currency: row.currency, amount: row.amount_due }))
    ),
  };
}

/**
 * Fixed-window revenue trend (last 90 days, weekly buckets) for the
 * dashboard's compact chart — a thin, dashboard-owned wrapper around the
 * same get_revenue_by_period RPC Reports uses (00022_create_reporting_
 * functions.sql), with no date-range/granularity controls: the dashboard
 * is a fixed at-a-glance summary, not a second Reports page.
 */
export async function getRevenueTrend(
  workspaceId: string,
  currency: string
): Promise<RevenueTrendPoint[]> {
  const supabase = await createClient();
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 89);

  const { data, error } = await supabase.rpc("get_revenue_by_period", {
    p_workspace_id: workspaceId,
    p_currency: currency,
    p_granularity: "week",
    p_from_date: from.toISOString().slice(0, 10),
    p_to_date: to.toISOString().slice(0, 10),
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as RevenueTrendPoint[];
}

/**
 * The single best-selling catalog item this month, for the dashboard's
 * highlight card — a thin wrapper around get_revenue_by_catalog_item
 * (00029_create_catalog_revenue_report.sql, Phase 10), which already
 * returns up to 10 rows ordered by total descending; the dashboard just
 * takes the first.
 */
export async function getTopCatalogItem(
  workspaceId: string,
  currency: string
): Promise<TopCatalogItem> {
  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc("get_revenue_by_catalog_item", {
    p_workspace_id: workspaceId,
    p_currency: currency,
    p_from_date: monthStart,
    p_to_date: today,
  });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as {
    catalog_item_id: string;
    catalog_item_name: string;
    quantity: number;
    total: number;
  }[];

  if (rows.length === 0) return null;

  const top = rows[0];
  return {
    catalogItemId: top.catalog_item_id,
    catalogItemName: top.catalog_item_name,
    quantity: top.quantity,
    total: top.total,
  };
}

/**
 * Workspace-wide recent activity feed — the first read of `activities`
 * that isn't scoped to a single entity (every existing caller, e.g.
 * getQuotationActivities/getInvoiceActivities, filters by entity_type +
 * entity_id). Same table, same actor join, just a wider filter and a
 * caller-supplied limit.
 */
export async function getWorkspaceActivities(workspaceId: string, limit: number) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("*, actor:profiles!actor_id(full_name, avatar_url)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}
