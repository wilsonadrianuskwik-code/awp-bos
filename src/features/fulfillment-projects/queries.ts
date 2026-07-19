import { createClient } from "@/lib/supabase/server";
import type {
  FulfillmentDeliverable,
  FulfillmentDeliverableFilters,
  FulfillmentProjectWithRollup,
} from "@/features/fulfillment-projects/types";

// Thin wrapper around get_fulfillment_project_by_invoice
// (00052_fulfillment_projects.sql, extended in 00054 with deliverable
// rollups) — the single read path the Client -> Invoice picker workspace
// needs. Returns null if the invoice hasn't reached partial/paid yet (no
// project exists), rather than creating one as a side effect of a read.
export async function getFulfillmentProjectByInvoice(
  workspaceId: string,
  invoiceId: string
): Promise<FulfillmentProjectWithRollup | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_fulfillment_project_by_invoice", {
    p_workspace_id: workspaceId,
    p_invoice_id: invoiceId,
  });

  if (error) throw error;

  const rows = (data ?? []) as FulfillmentProjectWithRollup[];
  return rows[0] ?? null;
}

// Plain table read — RLS SELECT is already open to all workspace members,
// same pattern as getClientActivities/getInvoiceActivities.
export async function getFulfillmentProjectActivities(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("*, actor:profiles!actor_id(full_name, avatar_url)")
    .eq("entity_type", "fulfillment_project")
    .eq("entity_id", projectId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
}

const DEFAULT_PAGE_SIZE = 100;

export async function getFulfillmentDeliverables(
  workspaceId: string,
  projectId: string,
  filters: FulfillmentDeliverableFilters = {},
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE
): Promise<{ items: FulfillmentDeliverable[]; totalCount: number }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_fulfillment_deliverables", {
    p_workspace_id: workspaceId,
    p_project_id: projectId,
    p_status: filters.status ?? null,
    p_from_date: filters.fromDate ?? null,
    p_to_date: filters.toDate ?? null,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });

  if (error) throw error;

  const rows = (data ?? []) as (FulfillmentDeliverable & {
    total_count: number;
  })[];

  return {
    items: rows.map(({ total_count: _total_count, ...row }) => row),
    totalCount: rows[0]?.total_count ?? 0,
  };
}
