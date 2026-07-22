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

export const DELIVERABLE_STATUSES = ["scheduled", "posted", "cancelled"] as const;

export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

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
