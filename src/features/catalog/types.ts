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
