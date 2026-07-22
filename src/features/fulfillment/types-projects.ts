export const FULFILLMENT_PROJECT_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type FulfillmentProjectStatus =
  (typeof FULFILLMENT_PROJECT_STATUSES)[number];

export type FulfillmentProject = {
  id: string;
  workspace_id: string;
  invoice_id: string;
  client_id: string;
  // Nullable: blank until Operations names the project — see
  // 00052_fulfillment_projects.sql for why this is deliberate.
  name: string | null;
  status: FulfillmentProjectStatus;
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
export type FulfillmentProjectWithRollup = {
  id: string;
  workspace_id: string;
  invoice_id: string;
  invoice_number: string;
  client_id: string;
  client_name: string;
  name: string | null;
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
  "draft",
  "scheduled",
  "in_progress",
  "posted",
  "cancelled",
] as const;

export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

// Mirrors update_fulfillment_deliverable_status's state machine
// (supabase/migrations/00061_deliverable_draft_in_progress.sql) — the same
// transition set the Kanban board's drag/drop enforces, offered here as
// explicit menu actions (List row menu, detail sheet) instead of a drag
// gesture. Shared by DeliverableTable and DeliverableDetailSheet so the two
// surfaces never drift on what's a valid next status.
export const DELIVERABLE_NEXT_ACTIONS: Record<
  DeliverableStatus,
  { label: string; to: DeliverableStatus }[]
> = {
  draft: [
    { label: "Move to Scheduled", to: "scheduled" },
    { label: "Move to In Progress", to: "in_progress" },
    { label: "Cancel", to: "cancelled" },
  ],
  scheduled: [
    { label: "Start (In Progress)", to: "in_progress" },
    { label: "Mark Posted", to: "posted" },
    { label: "Cancel", to: "cancelled" },
  ],
  in_progress: [
    { label: "Mark Posted", to: "posted" },
    { label: "Back to Scheduled", to: "scheduled" },
    { label: "Cancel", to: "cancelled" },
  ],
  posted: [{ label: "Reopen (Scheduled)", to: "scheduled" }],
  cancelled: [
    { label: "Reopen (Scheduled)", to: "scheduled" },
    { label: "Mark Posted", to: "posted" },
  ],
};

export type FulfillmentDeliverable = {
  id: string;
  project_id: string;
  fulfillment_item_id: string | null;
  // Resolved via get_fulfillment_deliverables' join to fulfillment_items/
  // line_items when linked to a tracker; null otherwise.
  tracker_description: string | null;
  title: string;
  description: string | null;
  // Null for a 'draft' deliverable (an idea captured before it's actually
  // scheduled) — every other status normally carries a date, but nothing
  // enforces that server-side, so treat this as always-nullable.
  scheduled_date: string | null;
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
// navigation required to see what's due).
export type ClientFulfillmentDeliverable = {
  id: string;
  project_id: string;
  project_name: string;
  invoice_id: string;
  fulfillment_item_id: string | null;
  tracker_description: string | null;
  title: string;
  scheduled_date: string | null;
  status: DeliverableStatus;
  is_overdue: boolean;
  assigned_to: string | null;
};
