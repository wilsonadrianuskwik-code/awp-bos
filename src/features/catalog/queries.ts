import { createClient } from "@/lib/supabase/server";
import type {
  CatalogFilters,
  CatalogItem,
  CatalogItemUsage,
  CatalogListResult,
  CatalogStats,
} from "@/features/catalog/types";

export async function getCatalogItems(
  workspaceId: string,
  filters?: CatalogFilters
): Promise<CatalogListResult> {
  const supabase = await createClient();

  let query = supabase
    .from("catalog_items")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  if (filters?.itemType && filters.itemType !== "all") {
    query = query.eq("item_type", filters.itemType);
  }
  if (filters?.status === "active") {
    query = query.eq("is_active", true);
  } else if (filters?.status === "inactive") {
    query = query.eq("is_active", false);
  }
  if (filters?.category && filters.category !== "all") {
    query = query.eq("default_category", filters.category);
  }
  if (filters?.search) {
    const term = filters.search.replace(/[%_]/g, "");
    const like = `%${term}%`;
    query = query.or(
      `name.ilike.${like},sku.ilike.${like},description.ilike.${like}`
    );
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
  if (error) throw error;

  return { items: data ?? [], count: count ?? 0 };
}

// Workspace-wide counts/totals for the KPI ribbon — independent of the
// current page's filters, matching getInvoiceStats/getQuotationStats.
export async function getCatalogStats(workspaceId: string): Promise<CatalogStats> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("catalog_items")
    .select("item_type, is_active, default_unit_price, currency")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  const rows = data ?? [];
  const totals = new Map<string, number>();
  let activeCount = 0;
  let productCount = 0;
  let serviceCount = 0;

  for (const row of rows) {
    if (row.is_active) {
      activeCount++;
      totals.set(
        row.currency,
        (totals.get(row.currency) ?? 0) + row.default_unit_price
      );
    }
    if (row.item_type === "product") productCount++;
    else if (row.item_type === "service") serviceCount++;
  }

  return {
    totalCount: rows.length,
    activeCount,
    inactiveCount: rows.length - activeCount,
    productCount,
    serviceCount,
    totalValueByCurrency: Array.from(totals, ([currency, amount]) => ({ currency, amount })),
  };
}

// How much this catalog item is actually used across issued documents —
// line_items.catalog_item_id is a snapshot link (ON DELETE SET NULL), so
// this counts historical usage, not a live pricing rollup.
export async function getCatalogItemUsage(
  itemId: string
): Promise<CatalogItemUsage> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("line_items")
    .select("entity_id, quantity")
    .eq("catalog_item_id", itemId);

  const rows = data ?? [];
  return {
    documentCount: new Set(rows.map((r) => r.entity_id)).size,
    totalQuantity: rows.reduce((sum, r) => sum + r.quantity, 0),
  };
}

// Used exclusively by the quotation/invoice catalog picker — the
// management page (getCatalogItems above) must keep showing inactive
// items, so filtering by is_active only ever happens here, not in RLS.
export async function getActiveCatalogItems(
  workspaceId: string
): Promise<CatalogItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalog_items")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getCatalogItem(
  itemId: string,
  workspaceId: string
): Promise<CatalogItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalog_items")
    .select("*")
    .eq("id", itemId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .single();

  if (error) return null;
  return data;
}

export async function getCatalogItemActivities(itemId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("*, actor:profiles!actor_id(full_name, avatar_url)")
    .eq("entity_type", "catalog_item")
    .eq("entity_id", itemId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
}
