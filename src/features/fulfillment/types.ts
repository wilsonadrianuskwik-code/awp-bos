import type { LineItemCategory } from "@/features/line-items/types";

export const FULFILLMENT_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

export type FulfillmentItem = {
  id: string;
  workspace_id: string;
  invoice_id: string;
  client_id: string;
  line_item_id: string;
  status: FulfillmentStatus;
  assigned_to: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type FulfillmentEvent = {
  id: string;
  workspace_id: string;
  fulfillment_item_id: string;
  quantity_delivered: number;
  event_date: string;
  notes: string | null;
  idempotency_key: string | null;
  recorded_by: string;
  created_at: string;
  deleted_at: string | null;
};

// fulfillment_events.recorded_by references auth.users, not profiles — no
// relationship PostgREST can embed directly (same lesson already learned
// for invoices.created_by/payments.recorded_by), so the profile is
// resolved via a second query and attached here.
export type FulfillmentEventWithRecorder = FulfillmentEvent & {
  recorded_by_profile: { full_name: string | null } | null;
};

// Shape returned by get_fulfillment_items — a tracker joined with its
// invoice/client/line-item context plus computed progress fields.
// purchased/delivered/remaining/progress_percent/is_over_delivered are
// always derived at read time (never cached) — same discipline as
// getPaymentProgress in the invoices feature.
export type FulfillmentItemWithProgress = {
  id: string;
  invoice_id: string;
  invoice_number: string;
  client_id: string;
  client_name: string;
  line_item_id: string;
  description: string;
  unit: string | null;
  category: LineItemCategory;
  status: FulfillmentStatus;
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  purchased: number;
  delivered: number;
  remaining: number;
  progress_percent: number;
  is_over_delivered: boolean;
};

// The "actually billed" invoice statuses established by the Catalog
// Revenue Report (Phase 10) — an invoice line item is only eligible for
// fulfillment tracking once its invoice has reached one of these. Used at
// the UI layer to decide whether to offer "Track Fulfillment"; the RPCs
// (sync_fulfillment_items/create_fulfillment_item) are the actual source
// of truth and re-check this server-side.
export const FULFILLMENT_ELIGIBLE_INVOICE_STATUSES = [
  "sent",
  "viewed",
  "partial",
  "paid",
  "overdue",
] as const;

export type FulfillmentItemFilters = {
  status?: FulfillmentStatus;
  clientId?: string;
  invoiceId?: string;
};

export type PaginatedFulfillmentItems = {
  items: FulfillmentItemWithProgress[];
  totalCount: number;
};
