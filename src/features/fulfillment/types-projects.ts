// A project's identity/status is not a separately stored, editable thing —
// its name doesn't exist at all (every surface uses the invoice number/
// client name instead) and its status is always computed from its own
// trackers (see get_fulfillment_project_by_invoice,
// supabase/migrations/00065_remove_project_name_status.sql), never stored
// or manually transitioned. "cancelled" is not a reachable value here for
// exactly that reason — a computed rollup has no signal for "someone
// decided to cancel this"; that decision lives on the invoice instead.
export const FULFILLMENT_PROJECT_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
] as const;

export type FulfillmentProjectStatus =
  (typeof FULFILLMENT_PROJECT_STATUSES)[number];

export type FulfillmentProject = {
  id: string;
  workspace_id: string;
  invoice_id: string;
  client_id: string;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

// Shape returned by get_fulfillment_project_by_invoice — a project joined
// with its invoice/client context plus rollup counts, computed at read
// time (never cached), same discipline as FulfillmentItemWithProgress.
// `status` is likewise always computed (see FulfillmentProjectStatus above)
// — there is no `name` field; the invoice number/client name are the
// project's identity.
export type FulfillmentProjectWithRollup = {
  id: string;
  workspace_id: string;
  invoice_id: string;
  invoice_number: string;
  client_id: string;
  client_name: string;
  status: FulfillmentProjectStatus;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  tracker_count: number;
  tracker_completed_count: number;
  deliverable_count: number;
  deliverable_posted_count: number;
  next_deliverable_date: string | null;
};

export const DELIVERABLE_STATUSES = [
  "scheduled",
  "in_progress",
  "posted",
  "cancelled",
] as const;

export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

const DELIVERABLE_STATUS_ACTION_LABEL: Record<DeliverableStatus, string> = {
  scheduled: "Move to Scheduled",
  in_progress: "Move to In Progress",
  posted: "Mark Posted",
  cancelled: "Cancel",
};

// Mirrors update_fulfillment_deliverable_status's state machine
// (supabase/migrations/00062_remove_draft_free_transitions.sql) —
// unrestricted movement between all 4 statuses, the same freedom the
// Kanban board's drag/drop allows. Shared by DeliverableTable and
// DeliverableDetailSheet so the two surfaces never drift on what's
// offered as a next status. Every status offers every OTHER status as an
// action — there is no restricted subset.
export const DELIVERABLE_NEXT_ACTIONS: Record<
  DeliverableStatus,
  { label: string; to: DeliverableStatus }[]
> = Object.fromEntries(
  DELIVERABLE_STATUSES.map((from) => [
    from,
    DELIVERABLE_STATUSES.filter((to) => to !== from).map((to) => ({
      label: DELIVERABLE_STATUS_ACTION_LABEL[to],
      to,
    })),
  ])
) as Record<DeliverableStatus, { label: string; to: DeliverableStatus }[]>;

export type FulfillmentDeliverable = {
  id: string;
  project_id: string;
  fulfillment_item_id: string | null;
  // Resolved via get_fulfillment_deliverables' join to fulfillment_items/
  // line_items when linked to a tracker; null otherwise.
  tracker_description: string | null;
  title: string;
  description: string | null;
  scheduled_date: string;
  status: DeliverableStatus;
  // Computed at read time (scheduled_date in the past AND status =
  // 'scheduled') — never stored, matching the never-cache-progress
  // discipline used for purchased/delivered/remaining elsewhere.
  is_overdue: boolean;
  posted_at: string | null;
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FulfillmentDeliverableFilters = {
  status?: DeliverableStatus;
  fromDate?: string;
  toDate?: string;
};

// Shape returned by get_fulfillment_deliverables_by_client — a client's
// outstanding (scheduled) deliverables across ALL of their projects, for
// the cockpit's inline "Outstanding Deliverables" panel (no per-project
// navigation required to see what's due). Matches the RPC's actual
// RETURNS TABLE exactly (supabase/migrations/00065_remove_project_name_status.sql)
// — `invoice_number` replaces the old `project_name`, since a project has
// no name of its own to distinguish one row from another across a
// client's several projects; the invoice it belongs to is the natural
// per-row identifier instead.
export type ClientFulfillmentDeliverable = {
  id: string;
  project_id: string;
  invoice_number: string;
  fulfillment_item_id: string | null;
  tracker_description: string | null;
  title: string;
  scheduled_date: string;
  status: DeliverableStatus;
  is_overdue: boolean;
};
