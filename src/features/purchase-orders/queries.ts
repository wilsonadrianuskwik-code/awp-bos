import { createClient } from "@/lib/supabase/server";
import { logDbError } from "@/lib/log-db-error";
import type {
  DocumentRelationship,
  PurchaseOrderDetail,
  PurchaseOrderFilters,
  PurchaseOrderListResult,
  PurchaseOrderStats,
  PurchaseOrderWithRelations,
} from "@/features/purchase-orders/types";

const SUPPLIER_JOIN = "supplier:suppliers(id,name,company,email,phone,payment_terms,preferred_currency)";
const PROJECT_JOIN = "project:projects(id,code,name)";

export async function getPurchaseOrders(
  workspaceId: string,
  filters?: PurchaseOrderFilters
): Promise<PurchaseOrderListResult> {
  const supabase = await createClient();

  let query = supabase
    .from("purchase_orders")
    .select(`*, ${SUPPLIER_JOIN}, ${PROJECT_JOIN}`, { count: "exact" })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  if (filters?.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  if (filters?.supplierId) {
    query = query.eq("supplier_id", filters.supplierId);
  }

  if (filters?.projectId) {
    query = query.eq("project_id", filters.projectId);
  }

  if (filters?.search) {
    const term = filters.search.replace(/[%_]/g, "");
    const like = `%${term}%`;

    const { data: matchingSuppliers } = await supabase
      .from("suppliers")
      .select("id")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .or(`name.ilike.${like},company.ilike.${like}`);

    const supplierIds = (matchingSuppliers ?? []).map((s) => s.id);

    const orClauses = [`title.ilike.${like}`, `po_number.ilike.${like}`];
    if (supplierIds.length > 0) {
      orClauses.push(`supplier_id.in.(${supplierIds.join(",")})`);
    }
    query = query.or(orClauses.join(","));
  }

  const sortBy = filters?.sortBy ?? "created_at";
  const sortDir = filters?.sortDir ?? "desc";
  query = query.order(sortBy, { ascending: sortDir === "asc" });

  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    logDbError("getPurchaseOrders", error, { workspaceId });
    throw new Error(error.message);
  }

  return {
    purchaseOrders: (data ?? []) as unknown as PurchaseOrderWithRelations[],
    count: count ?? 0,
  };
}

export async function getPurchaseOrderById(
  poId: string,
  workspaceId: string
): Promise<PurchaseOrderDetail | null> {
  const supabase = await createClient();

  const { data: po, error } = await supabase
    .from("purchase_orders")
    .select(`*, ${SUPPLIER_JOIN}, ${PROJECT_JOIN}`)
    .eq("id", poId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .single();

  if (error) {
    if (error.code !== "PGRST116") {
      logDbError("getPurchaseOrderById", error, { poId, workspaceId });
    }
    return null;
  }
  if (!po) return null;

  const { data: lineItems } = await supabase
    .from("line_items")
    .select("*")
    .eq("entity_type", "purchase_order")
    .eq("entity_id", poId)
    .order("sort_order", { ascending: true });

  return {
    ...po,
    line_items: lineItems ?? [],
  } as unknown as PurchaseOrderDetail;
}

export async function getPurchaseOrderActivities(poId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("*, actor:profiles!actor_id(full_name, avatar_url)")
    .eq("entity_type", "purchase_order")
    .eq("entity_id", poId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
}

/**
 * Traceability chain for the Inspector's "Linked Documents" — thin wrapper
 * around get_document_relationships (supabase/migrations/
 * 00074_document_engine_seed_and_generate.sql).
 */
export async function getPurchaseOrderRelationships(
  workspaceId: string,
  poId: string
): Promise<DocumentRelationship[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_document_relationships", {
    p_workspace_id: workspaceId,
    p_document_type: "purchase_order",
    p_document_id: poId,
  });

  if (error) {
    logDbError("getPurchaseOrderRelationships (rpc get_document_relationships)", error, { poId, workspaceId });
    throw new Error(error.message);
  }
  return (data ?? []) as DocumentRelationship[];
}

/**
 * Workspace-wide PO stats for the list page's KPI ribbon — unfiltered by
 * the current page's search/status/page, same pattern as
 * getInvoiceStats/get_invoice_stats. No dedicated RPC exists for purchase
 * orders yet, so this reduces client-side over a lightweight select.
 */
export async function getPurchaseOrderStats(
  workspaceId: string
): Promise<PurchaseOrderStats> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("purchase_orders")
    .select("status,total,currency")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  const rows = data ?? [];
  const totalValueByCurrency = new Map<string, number>();
  for (const row of rows) {
    totalValueByCurrency.set(
      row.currency,
      (totalValueByCurrency.get(row.currency) ?? 0) + Number(row.total)
    );
  }

  return {
    totalCount: rows.length,
    draftCount: rows.filter((r) => r.status === "draft").length,
    sentCount: rows.filter((r) =>
      ["sent", "acknowledged", "partially_received"].includes(r.status)
    ).length,
    receivedCount: rows.filter((r) => r.status === "received").length,
    totalValueByCurrency: Array.from(totalValueByCurrency, ([currency, amount]) => ({
      currency,
      amount,
    })),
  };
}
