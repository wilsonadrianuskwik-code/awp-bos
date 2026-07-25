import type { LineItem } from "@/features/line-items/types";
import type { SupplierSummary } from "@/features/suppliers/types";

export const PURCHASE_ORDER_STATUSES = [
  "draft",
  "sent",
  "acknowledged",
  "partially_received",
  "received",
  "cancelled",
] as const;

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export type PurchaseOrder = {
  id: string;
  workspace_id: string;
  po_number: string;
  supplier_id: string;
  project_id: string | null;
  status: PurchaseOrderStatus;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  currency: string;
  issue_date: string;
  expected_date: string | null;
  title: string | null;
  terms_and_conditions: string | null;
  notes: string | null;
  internal_notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ProjectSummary = {
  id: string;
  code: string;
  name: string;
};

export type PurchaseOrderWithRelations = PurchaseOrder & {
  supplier: SupplierSummary | null;
  project: ProjectSummary | null;
};

export type PurchaseOrderDetail = PurchaseOrderWithRelations & {
  line_items: LineItem[];
};

export type DocumentRelationship = {
  direction: "generated_to" | "generated_from";
  related_type: string;
  related_id: string;
  relationship: string;
};

export type PurchaseOrderFilters = {
  search?: string;
  status?: PurchaseOrderStatus | "all";
  supplierId?: string;
  projectId?: string;
  sortBy?: "created_at" | "total" | "expected_date";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type PurchaseOrderListResult = {
  purchaseOrders: PurchaseOrderWithRelations[];
  count: number;
};

export type PurchaseOrderStats = {
  totalCount: number;
  draftCount: number;
  sentCount: number;
  receivedCount: number;
  totalValueByCurrency: { currency: string; amount: number }[];
};
