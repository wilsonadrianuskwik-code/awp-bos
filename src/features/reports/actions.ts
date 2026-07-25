"use server";

import {
  getApAging,
  getArAging,
  getDeliveryPerformance,
  getFulfillmentOverview,
  getProjectProfitability,
  getPurchaseOrderStatusSummary,
  getRevenueByCatalogItem,
  getRevenueByPeriod,
} from "@/features/reports/queries";
import type {
  ArAgingInput,
  CatalogRevenueInput,
  RevenueByPeriodInput,
} from "@/features/reports/validators";

/**
 * Server Action wrapper — getRevenueByPeriod (queries.ts) uses the
 * server-only Supabase client (next/headers cookies()), so it can't be
 * called directly from the interactive "use client" chart component when
 * the user changes granularity/date-range/currency. This is a thin
 * pass-through to the same Milestone 1 query/RPC, not a new data path.
 */
export async function getRevenueByPeriodAction(
  workspaceId: string,
  input: RevenueByPeriodInput
) {
  try {
    const data = await getRevenueByPeriod(workspaceId, input);
    return { data, error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load revenue report";
    return { data: null, error: message };
  }
}

/**
 * Same reasoning as getRevenueByPeriodAction, for the AR Aging card's
 * currency-change refetching.
 */
export async function getArAgingAction(workspaceId: string, input: ArAgingInput) {
  try {
    const data = await getArAging(workspaceId, input);
    return { data, error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load AR aging report";
    return { data: null, error: message };
  }
}

/**
 * Same reasoning as getRevenueByPeriodAction, for the Catalog Revenue
 * card's date-range/currency-change refetching.
 */
export async function getCatalogRevenueAction(
  workspaceId: string,
  input: CatalogRevenueInput
) {
  try {
    const data = await getRevenueByCatalogItem(workspaceId, input);
    return { data, error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load catalog revenue report";
    return { data: null, error: message };
  }
}

/**
 * Fulfillment Overview has no user-adjustable inputs (no currency, no date
 * range — see getFulfillmentOverview), so this action takes only a
 * workspaceId; still a Server Action wrapper for the same "use client"
 * data-fetching reason as the other report cards.
 */
export async function getFulfillmentOverviewAction(workspaceId: string) {
  try {
    const data = await getFulfillmentOverview(workspaceId);
    return { data, error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load fulfillment overview";
    return { data: null, error: message };
  }
}

/** Same reasoning as getArAgingAction, mirrored for Purchase Orders/Suppliers. */
export async function getApAgingAction(workspaceId: string, input: ArAgingInput) {
  try {
    const data = await getApAging(workspaceId, input);
    return { data, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load AP aging report";
    return { data: null, error: message };
  }
}

/** No user-adjustable inputs, same shape as getFulfillmentOverviewAction. */
export async function getProjectProfitabilityAction(workspaceId: string) {
  try {
    const data = await getProjectProfitability(workspaceId);
    return { data, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load project profitability";
    return { data: null, error: message };
  }
}

/** Same pass-through reasoning as the other report actions. */
export async function getPurchaseOrderStatusSummaryAction(workspaceId: string) {
  try {
    const data = await getPurchaseOrderStatusSummary(workspaceId);
    return { data, error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load purchase order report";
    return { data: null, error: message };
  }
}

/** Same pass-through reasoning as the other report actions. */
export async function getDeliveryPerformanceAction(
  workspaceId: string,
  fromDate: string,
  toDate: string
) {
  try {
    const data = await getDeliveryPerformance(workspaceId, fromDate, toDate);
    return { data, error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load delivery report";
    return { data: null, error: message };
  }
}
