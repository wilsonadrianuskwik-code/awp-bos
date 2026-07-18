import type { LineItemCategory } from "@/features/line-items/types";

export const ITEM_TYPES = ["product", "service"] as const;

export type ItemType = (typeof ITEM_TYPES)[number];

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
  currency: string;
  is_active: boolean;
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

// Lightweight "where is this used" signal for the detail page — how many
// issued line items were copied from this catalog item, and how many
// units in total. Traceability only (catalog_item_id on line_items is
// snapshot-at-insert, never a live reference), so this is informational,
// not a live rollup of current pricing.
export type CatalogItemUsage = {
  documentCount: number;
  totalQuantity: number;
};
