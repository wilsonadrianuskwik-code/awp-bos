import { createClient } from "@/lib/supabase/server";
import {
  arAgingSchema,
  revenueByPeriodSchema,
  type ArAgingInput,
  type RevenueByPeriodInput,
} from "@/features/reports/validators";
import type {
  ArAgingBucket,
  AvailableCurrencies,
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
