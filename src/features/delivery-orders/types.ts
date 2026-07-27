import type { PostalAddress } from "@/features/documents/address";
import type { ClientSummary } from "@/features/line-items/types";

export const DELIVERY_ORDER_STATUSES = [
  "draft",
  "prepared",
  "dispatched",
  "delivered",
  "cancelled",
] as const;

export type DeliveryOrderStatus = (typeof DELIVERY_ORDER_STATUSES)[number];

export type DeliveryAddress = PostalAddress;

export type DeliveryOrder = {
  id: string;
  workspace_id: string;
  do_number: string;
  invoice_id: string;
  project_id: string | null;
  client_id: string;
  status: DeliveryOrderStatus;
  delivery_date: string | null;
  delivery_address: DeliveryAddress;
  received_by: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type InvoiceSummary = {
  id: string;
  invoice_number: string;
};

export type ProjectSummary = {
  id: string;
  code: string;
  name: string;
  /** Offered as the delivery destination — usually where goods go. */
  site_address?: PostalAddress;
};

export type DeliveryOrderWithRelations = DeliveryOrder & {
  client: ClientSummary | null;
  invoice: InvoiceSummary | null;
  project: ProjectSummary | null;
};

// The polymorphic line_items table isn't typed for entity_type =
// "delivery_order" in the shared LineItem type — delivery order lines
// carry only description/quantity/unit (no pricing), so this feature
// defines its own narrow shape rather than widening the shared one.
export type DeliveryOrderLineItem = {
  id: string;
  entity_type: "delivery_order";
  entity_id: string;
  sort_order: number;
  description: string;
  quantity: number;
  unit: string | null;
  /** Set when this line was generated from an invoice line — drives the
      automatic fulfillment posting in 00081. */
  source_line_item_id: string | null;
};

export type DeliveryOrderDetail = DeliveryOrderWithRelations & {
  line_items: DeliveryOrderLineItem[];
};

export type DeliveryOrderFilters = {
  search?: string;
  status?: DeliveryOrderStatus | "all";
  invoiceId?: string;
  sortBy?: "created_at" | "delivery_date";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type DeliveryOrderListResult = {
  deliveryOrders: DeliveryOrderWithRelations[];
  count: number;
};

export type DeliveryOrderLineInput = {
  description: string;
  quantity: number;
  unit?: string;
  /**
   * The invoice line this delivery line fulfils. Set whenever the source
   * is known, so marking the Delivery Order delivered posts fulfillment
   * progress against that line automatically (00081).
   */
  source_line_item_id?: string;
};

export type CreateDeliveryOrderInput = {
  invoice_id: string;
  project_id?: string | null;
  delivery_date?: string | null;
  delivery_address?: DeliveryAddress;
  notes?: string | null;
  line_items: DeliveryOrderLineInput[];
};

export type UpdateDeliveryOrderInput = {
  delivery_date?: string | null;
  /** Explicit null clears the override and falls back to the client. */
  delivery_address?: DeliveryAddress;
  received_by?: string | null;
  notes?: string | null;
};
