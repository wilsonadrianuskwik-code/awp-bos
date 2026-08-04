import { sanitizeSearchTerm } from "@/lib/utils/search-term";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  CatalogFilters,
  CatalogItem,
  CatalogItemClientPrice,
  CatalogItemUsage,
  CatalogListResult,
  CatalogStats,
  PackageItem,
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
    const term = sanitizeSearchTerm(filters.search);
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
  const { data } = await supabase.rpc("get_catalog_stats", { p_workspace_id: workspaceId });

  return (
    (data as CatalogStats | null) ?? {
      totalCount: 0,
      activeCount: 0,
      inactiveCount: 0,
      productCount: 0,
      serviceCount: 0,
      totalValueByCurrency: [],
    }
  );
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

// Active standalone (non-package) items, for the package builder's "add
// item" product picker. Excludes packages so a package can't nest another
// package, and returns the full list (no pagination) since it feeds a
// searchable in-form picker. Optionally excludes one item id (the package
// being edited, though a package is already filtered out by is_package).
export async function getStandaloneCatalogItems(
  workspaceId: string
): Promise<CatalogItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalog_items")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_package", false)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// Live package breakdowns for a set of catalog_item_ids referenced by a
// document's line items (their catalog_item_id) — keyed by catalog item id,
// values are that package's *current* package_items. Per the product
// decision the breakdown is resolved live (not snapshotted onto the line
// item), so editing a package's contents later restyles how it renders on
// every document that referenced it, past or present; only the price
// captured on each line item at insert time stays fixed. A deleted or
// non-package id is simply absent from the result — the caller falls back
// to showing just the line item with no breakdown.
export async function getPackageBreakdowns(
  workspaceId: string,
  catalogItemIds: string[]
): Promise<Record<string, PackageItem[]>> {
  if (catalogItemIds.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("catalog_items")
    .select("id, package_items")
    .eq("workspace_id", workspaceId)
    .eq("is_package", true)
    .in("id", catalogItemIds);

  return Object.fromEntries((data ?? []).map((row) => [row.id, row.package_items]));
}

// Admin-client counterpart for the unauthenticated customer portal (share
// -token access, no workspace membership/session) — same query, mirrors
// the getInvoiceByShareToken/getQuotationByShareToken split elsewhere.
export async function getPackageBreakdownsForPortal(
  workspaceId: string,
  catalogItemIds: string[]
): Promise<Record<string, PackageItem[]>> {
  if (catalogItemIds.length === 0) return {};
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("catalog_items")
    .select("id, package_items")
    .eq("workspace_id", workspaceId)
    .eq("is_package", true)
    .in("id", catalogItemIds);

  return Object.fromEntries((data ?? []).map((row) => [row.id, row.package_items]));
}

// Every customer-price override in the workspace, flat. Builders fetch
// this once alongside the catalog list and resolve price client-side as
// the user picks a client — cheap at realistic override volumes, and
// avoids a round trip every time the client selection changes.
export async function getCatalogItemClientPrices(
  workspaceId: string
): Promise<CatalogItemClientPrice[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalog_item_client_prices")
    .select("id, catalog_item_id, client_id, unit_price, client:clients(name)")
    .eq("workspace_id", workspaceId);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    catalog_item_id: row.catalog_item_id,
    client_id: row.client_id,
    unit_price: row.unit_price,
    client_name: (row.client as unknown as { name: string } | null)?.name ?? "—",
  }));
}

// Overrides for one catalog item — feeds the "Customer Pricing" section
// on its detail page.
export async function getCatalogItemClientPricesForItem(
  itemId: string,
  workspaceId: string
): Promise<CatalogItemClientPrice[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalog_item_client_prices")
    .select("id, catalog_item_id, client_id, unit_price, client:clients(name)")
    .eq("workspace_id", workspaceId)
    .eq("catalog_item_id", itemId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    catalog_item_id: row.catalog_item_id,
    client_id: row.client_id,
    unit_price: row.unit_price,
    client_name: (row.client as unknown as { name: string } | null)?.name ?? "—",
  }));
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
