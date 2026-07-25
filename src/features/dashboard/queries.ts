import { createClient } from "@/lib/supabase/server";
import type {
  ActiveFulfillmentSummary,
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
 * Open (pending/in_progress) fulfillment tracker count — a plain head-only
 * count query, the same cheap shape as getClientSummary. Callers are
 * expected to call syncFulfillmentItemsAction first (idempotent — see
 * sync_fulfillment_items) so newly-eligible line items are counted too.
 */
export async function getActiveFulfillmentSummary(
  workspaceId: string
): Promise<ActiveFulfillmentSummary> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("fulfillment_items")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .in("status", ["pending", "in_progress"]);

  return { activeCount: count ?? 0 };
}

export type AttentionItem = {
  label: string;
  count: number;
  href: string;
};

/**
 * The dashboard's Attention Strip (Construction BOS command-center
 * redesign, replacing the CRM's revenue-hero-first layout) — counted
 * exceptions across every document type, each a clickable chip. Every
 * count is a head-only query, same cheap shape as getClientSummary.
 * Rows with a zero count are filtered out by the caller so the strip
 * only ever shows things that actually need attention.
 */
export async function getAttentionItems(workspaceId: string): Promise<AttentionItem[]> {
  const supabase = await createClient();

  const [overdueInvoices, posAwaiting, delaysDelivery, expiringQuotations] = await Promise.all([
    supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .eq("status", "overdue"),
    supabase
      .from("purchase_orders")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .in("status", ["sent", "acknowledged"]),
    supabase
      .from("delivery_orders")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .lt("delivery_date", new Date().toISOString().slice(0, 10))
      .not("status", "in", "(delivered,cancelled)"),
    supabase
      .from("quotations")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .eq("status", "sent")
      .lte("expiry_date", new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)),
  ]);

  const items: AttentionItem[] = [
    { label: "Invoices Overdue", count: overdueInvoices.count ?? 0, href: "/invoices?status=overdue" },
    { label: "POs Awaiting Receipt", count: posAwaiting.count ?? 0, href: "/purchase-orders" },
    { label: "Deliveries Delayed", count: delaysDelivery.count ?? 0, href: "/delivery-orders" },
    { label: "Quotations Expiring This Week", count: expiringQuotations.count ?? 0, href: "/quotations" },
  ];

  return items.filter((item) => item.count > 0);
}

export type ProjectHealthCard = {
  id: string;
  code: string;
  name: string;
  status: string;
  clientName: string | null;
  currency: string;
  health: { quoted_total: number; invoiced_total: number; paid_total: number; delivered_count: number; delivery_total: number };
};

/**
 * The dashboard's Active Projects grid — the actual center of gravity of
 * a construction business, replacing the CRM's single revenue-hero
 * number. Capped at 6 for the dashboard (the full portfolio lives on the
 * Projects list page); health is computed per-project via
 * get_project_health (00069_projects.sql), which reads quotations/
 * invoices/delivery_orders directly rather than assuming a fixed set of
 * document types.
 */
export async function getActiveProjectsWithHealth(workspaceId: string): Promise<ProjectHealthCard[]> {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, code, name, status, currency, client:clients(name)")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .in("status", ["planning", "active"])
    .order("created_at", { ascending: false })
    .limit(6);

  if (!projects || projects.length === 0) return [];

  const withHealth = await Promise.all(
    projects.map(async (project) => {
      const { data: health } = await supabase.rpc("get_project_health", {
        p_project_id: project.id,
        p_workspace_id: workspaceId,
      });
      return {
        id: project.id,
        code: project.code,
        name: project.name,
        status: project.status,
        currency: project.currency,
        clientName: (project.client as unknown as { name: string } | null)?.name ?? null,
        health: (health as ProjectHealthCard["health"]) ?? {
          quoted_total: 0,
          invoiced_total: 0,
          paid_total: 0,
          delivered_count: 0,
          delivery_total: 0,
        },
      };
    })
  );

  return withHealth;
}

export type ActionQueueItem = {
  id: string;
  type: "quotation" | "proforma_invoice" | "purchase_order" | "delivery_order";
  label: string;
  href: string;
};

/**
 * "Documents awaiting your action" — draft quotations not yet sent, POs
 * not yet acknowledged, DOs not yet dispatched — a personal to-do view
 * generated from document status rather than a separate task table.
 */
export async function getActionQueue(workspaceId: string): Promise<ActionQueueItem[]> {
  const supabase = await createClient();

  const [draftQuotations, unacknowledgedPOs, undispatchedDOs] = await Promise.all([
    supabase
      .from("quotations")
      .select("id, quotation_number")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("purchase_orders")
      .select("id, po_number")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("delivery_orders")
      .select("id, do_number")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .in("status", ["draft", "prepared"])
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const items: ActionQueueItem[] = [
    ...(draftQuotations.data ?? []).map((q) => ({
      id: q.id, type: "quotation" as const, label: `${q.quotation_number} — not sent`, href: `/quotations/${q.id}`,
    })),
    ...(unacknowledgedPOs.data ?? []).map((po) => ({
      id: po.id, type: "purchase_order" as const, label: `${po.po_number} — not acknowledged`, href: `/purchase-orders/${po.id}`,
    })),
    ...(undispatchedDOs.data ?? []).map((d) => ({
      id: d.id, type: "delivery_order" as const, label: `${d.do_number} — not dispatched`, href: `/delivery-orders/${d.id}`,
    })),
  ];

  return items.slice(0, 10);
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
