import { createClient } from "@/lib/supabase/server";
import {
  arAgingSchema,
  catalogRevenueSchema,
  revenueByPeriodSchema,
  type ArAgingInput,
  type CatalogRevenueInput,
  type RevenueByPeriodInput,
} from "@/features/reports/validators";
import type {
  ArAgingBucket,
  AvailableCurrencies,
  CatalogRevenueRow,
  FulfillmentOverviewRow,
  RevenuePeriodPoint,
} from "@/features/reports/types";

/**
 * Revenue over time, grouped by the requested granularity. Validated here
 * (Zod) before the RPC call, and defensively re-validated inside
 * get_revenue_by_period itself (00022_create_reporting_functions.sql) —
 * an RPC can always be called directly, bypassing this client-side check.
 */
export async function getRevenueByPeriod(
  workspaceId: string,
  input: RevenueByPeriodInput
): Promise<RevenuePeriodPoint[]> {
  const parsed = revenueByPeriodSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0].message);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_revenue_by_period", {
    p_workspace_id: workspaceId,
    p_currency: parsed.data.currency,
    p_granularity: parsed.data.granularity,
    p_from_date: parsed.data.fromDate,
    p_to_date: parsed.data.toDate,
  });

  if (error) throw new Error(error.message);

  return (data ?? []) as RevenuePeriodPoint[];
}

/**
 * Outstanding-balance aging buckets, as of today. Always four rows
 * (current/1-30/31-60/61+), zero-filled by the SQL function itself when a
 * bucket has no invoices.
 */
export async function getArAging(
  workspaceId: string,
  input: ArAgingInput
): Promise<ArAgingBucket[]> {
  const parsed = arAgingSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0].message);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_ar_aging", {
    p_workspace_id: workspaceId,
    p_currency: parsed.data.currency,
  });

  if (error) throw new Error(error.message);

  return (data ?? []).map(
    (row: { bucket: string; invoice_count: number; outstanding_amount: number }) => ({
      bucket: row.bucket,
      invoiceCount: row.invoice_count,
      outstandingAmount: row.outstanding_amount,
    })
  ) as ArAgingBucket[];
}

/**
 * Top 10 catalog items by invoiced revenue in the given date range/
 * currency. Unlike getRevenueByPeriod (payments-based, i.e. cash actually
 * collected), payments are recorded against a whole invoice with no link
 * to individual line items — so this can only measure invoiced amounts
 * (line_items.line_total), scoped to statuses that represent "actually
 * billed and still standing" (see get_revenue_by_catalog_item's own
 * comment in 00029_create_catalog_revenue_report.sql for the exact set
 * and why). A third, distinct definition of "revenue" from the other two
 * reports on this page — not an inconsistency, just what this join can
 * actually answer.
 */
export async function getRevenueByCatalogItem(
  workspaceId: string,
  input: CatalogRevenueInput
): Promise<CatalogRevenueRow[]> {
  const parsed = catalogRevenueSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0].message);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_revenue_by_catalog_item", {
    p_workspace_id: workspaceId,
    p_currency: parsed.data.currency,
    p_from_date: parsed.data.fromDate,
    p_to_date: parsed.data.toDate,
  });

  if (error) throw new Error(error.message);

  return (data ?? []).map(
    (row: {
      catalog_item_id: string;
      catalog_item_name: string;
      quantity: number;
      total: number;
    }) => ({
      catalogItemId: row.catalog_item_id,
      catalogItemName: row.catalog_item_name,
      quantity: row.quantity,
      total: row.total,
    })
  );
}

/**
 * Fulfillment status breakdown, as of today — mirrors getArAging's exact
 * shape (a point-in-time snapshot, always four zero-filled rows), but
 * counts items/remaining quantity rather than money, so it takes no
 * currency parameter (see get_fulfillment_overview,
 * 00031_create_fulfillment_overview_report.sql).
 */
export async function getFulfillmentOverview(
  workspaceId: string
): Promise<FulfillmentOverviewRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_fulfillment_overview", {
    p_workspace_id: workspaceId,
  });

  if (error) throw new Error(error.message);

  return (data ?? []).map(
    (row: { status: string; item_count: number; total_remaining: number }) => ({
      status: row.status,
      itemCount: row.item_count,
      totalRemaining: row.total_remaining,
    })
  ) as FulfillmentOverviewRow[];
}

/**
 * Distinct currencies actually present in the workspace's invoices and
 * payments — used to populate the report currency selector. A plain
 * query, not an RPC: no date-range grouping is needed, so this stays the
 * same shape as every other queries.ts function in this codebase (the
 * Dashboard convention), rather than a third reporting RPC.
 */
export async function getAvailableCurrencies(
  workspaceId: string
): Promise<AvailableCurrencies> {
  const supabase = await createClient();

  const [{ data: invoiceCurrencies }, { data: paymentCurrencies }] =
    await Promise.all([
      supabase
        .from("invoices")
        .select("currency")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null),
      supabase
        .from("payments")
        .select("currency")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null),
    ]);

  const currencies = new Set<string>();
  for (const row of invoiceCurrencies ?? []) currencies.add(row.currency);
  for (const row of paymentCurrencies ?? []) currencies.add(row.currency);

  return Array.from(currencies).sort();
}
