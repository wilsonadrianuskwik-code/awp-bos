import type { LineItemCategory } from "@/features/line-items/types";
import type { FulfillmentProjectStatus } from "@/features/fulfillment/types-projects";

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
  // -1 when this tracker covers a whole (non-package) line item. >= 0 when
  // it covers one sub-item of a package line, with name/quantity/unit/note
  // snapshotted at creation time (see 00051_package_fulfillment_tracking.sql)
  // so an operational delivery target doesn't shift if the package is
  // edited later while work is partially delivered.
  package_item_index: number;
  package_item_name: string | null;
  package_item_quantity: number | null;
  package_item_unit: string | null;
  package_item_note: string | null;
  // Nullable: set once this invoice reaches its Finance -> Operations
  // handoff (see 00053_fulfillment_projects_wiring_and_backfill.sql);
  // null for trackers on an invoice that hasn't been paid yet.
  project_id: string | null;
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
  // For a package sub-item tracker, prefixed with the parent line's own
  // description (e.g. "Paket Bisnis — Single Post Foto").
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
  // True when this tracker covers one sub-item of a package line rather
  // than a whole (non-package) line item.
  is_package_item: boolean;
  // The Fulfilment Project this tracker is nested under (see
  // types-projects.ts) — null until the invoice reaches its first payment.
  project_id: string | null;
  project_name: string | null;
  project_status: FulfillmentProjectStatus | null;
};

// Fulfillment only begins once an invoice has actually started being paid
// — sent/viewed/overdue invoices are billed but not yet paid, so their
// line items aren't eligible. Used at the UI layer to decide whether to
// offer "Track Fulfillment"; the RPCs (sync_fulfillment_items/
// create_fulfillment_item, 00032_fulfillment_workflow_refinements.sql) are
// the actual source of truth and re-check this server-side.
export const FULFILLMENT_ELIGIBLE_INVOICE_STATUSES = ["partial", "paid"] as const;

export type FulfillmentItemFilters = {
  status?: FulfillmentStatus;
  clientId?: string;
  invoiceId?: string;
  projectId?: string;
};

export type PaginatedFulfillmentItems = {
  items: FulfillmentItemWithProgress[];
  totalCount: number;
};
