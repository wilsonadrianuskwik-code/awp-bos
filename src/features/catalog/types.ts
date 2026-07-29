import type { LineItemCategory } from "@/features/line-items/types";

export const ITEM_TYPES = ["product", "service"] as const;

export type ItemType = (typeof ITEM_TYPES)[number];

// One entry inside a package's breakdown (catalog_items.package_items).
// A PackageItem may reference a standalone catalog product (product_id,
// which autofills name/unit at build time and links for traceability) or
// be a free-form "included" line with no product of its own — e.g.
// "Caption & Hashtag", "Posting Schedule PDF". Only name + quantity are
// required; note is optional descriptive text. There is no price here —
// per the product decision, breakdown lines render as "Termasuk dalam
// paket" (included), and only the package's own package_price counts.
export type PackageItem = {
  product_id: string | null;
  name: string;
  quantity: number;
  unit: string | null;
  note: string | null;
};

export type CatalogItem = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  sku: string | null;
  item_type: ItemType;
  default_category: LineItemCategory;
  default_unit_price: number;
  default_unit: string | null;
  // Master data links (00068). Nullable — items created before master
  // data existed, or created without picking one, carry NULL and fall
  // back to the free-text default_unit above.
  category_id: string | null;
  unit_of_measure_id: string | null;
  currency: string;
  is_active: boolean;
  // Package support (migration 00050). is_package=false → a standalone
  // item priced at default_unit_price (every pre-package row). is_package
  // =true → a bundle priced as a whole at package_price, whose breakdown
  // is package_items.
  is_package: boolean;
  package_price: number | null;
  package_items: PackageItem[];
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CatalogFilters = {
  search?: string;
  itemType?: ItemType | "all";
  status?: "active" | "inactive" | "all";
  category?: LineItemCategory | "all";
  sortBy?: "created_at" | "name" | "default_unit_price";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type CatalogListResult = {
  items: CatalogItem[];
  count: number;
};

// Workspace-wide (unfiltered by the current list-page filters), mirroring
// how getInvoiceStats/getQuotationStats compute their KPI ribbons.
export type CatalogStats = {
  totalCount: number;
  activeCount: number;
  inactiveCount: number;
  productCount: number;
  serviceCount: number;
  totalValueByCurrency: { currency: string; amount: number }[];
};

// A per-client price override (00094) — replaces default_unit_price for
// this one client when this item is inserted into a document they're
// billed on. Packages have no override concept (see the migration).
export type CatalogItemClientPrice = {
  id: string;
  catalog_item_id: string;
  client_id: string;
  client_name: string;
  unit_price: number;
};

// Lightweight "where is this used" signal for the detail page — how many
// issued line items were copied from this catalog item, and how many
// units in total. Traceability only (catalog_item_id on line_items is
// snapshot-at-insert, never a live reference), so this is informational,
// not a live rollup of current pricing.
export type CatalogItemUsage = {
  documentCount: number;
  totalQuantity: number;
};
