import { createClient } from "@/lib/supabase/server";
import type {
  FulfillmentEventWithRecorder,
  FulfillmentItemFilters,
  FulfillmentItemWithProgress,
  PaginatedFulfillmentItems,
} from "@/features/fulfillment/types";

const DEFAULT_PAGE_SIZE = 25;

// Thin wrapper around get_fulfillment_items (00030_create_fulfillment.sql)
// — a single set-based, paginated query; delivered/remaining/progress are
// always computed server-side from fulfillment_events, never cached.
export async function getFulfillmentItems(
  workspaceId: string,
  filters: FulfillmentItemFilters = {},
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE
): Promise<PaginatedFulfillmentItems> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_fulfillment_items", {
    p_workspace_id: workspaceId,
    p_status: filters.status ?? null,
    p_client_id: filters.clientId ?? null,
    p_fulfillment_item_id: null,
    p_invoice_id: filters.invoiceId ?? null,
    p_project_id: filters.projectId ?? null,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });

  if (error) throw error;

  const rows = (data ?? []) as (FulfillmentItemWithProgress & {
    total_count: number;
  })[];

  return {
    items: rows.map(({ total_count: _total_count, ...row }) => row),
    totalCount: rows[0]?.total_count ?? 0,
  };
}

export async function getFulfillmentItem(
  workspaceId: string,
  fulfillmentItemId: string
): Promise<FulfillmentItemWithProgress | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_fulfillment_items", {
    p_workspace_id: workspaceId,
    p_status: null,
    p_client_id: null,
    p_fulfillment_item_id: fulfillmentItemId,
    p_invoice_id: null,
    p_project_id: null,
    p_limit: 1,
    p_offset: 0,
  });

  if (error) throw error;

  const rows = (data ?? []) as (FulfillmentItemWithProgress & {
    total_count: number;
  })[];
  if (rows.length === 0) return null;

  const { total_count: _total_count, ...row } = rows[0];
  return row;
}

// Plain table read — RLS SELECT is already open to all workspace members,
// so this doesn't need an RPC (no aggregation, no cross-table computation).
// recorded_by references auth.users, which PostgREST can't embed directly,
// so profiles are resolved with a second query (same pattern
// invoices/queries.ts already uses for payments.recorded_by).
export async function getFulfillmentEvents(
  fulfillmentItemId: string
): Promise<FulfillmentEventWithRecorder[]> {
  const supabase = await createClient();

  const { data: events, error } = await supabase
    .from("fulfillment_events")
    .select("*")
    .eq("fulfillment_item_id", fulfillmentItemId)
    .is("deleted_at", null)
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;

  const recorderIds = new Set((events ?? []).map((e) => e.recorded_by));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", [...recorderIds]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return (events ?? []).map((e) => ({
    ...e,
    recorded_by_profile: profileById.get(e.recorded_by) ?? null,
  })) as FulfillmentEventWithRecorder[];
}
