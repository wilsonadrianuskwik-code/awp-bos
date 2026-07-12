"use server";

import { getArAging, getRevenueByPeriod } from "@/features/reports/queries";
import type {
  ArAgingInput,
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
