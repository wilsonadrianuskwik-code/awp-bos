export const PROJECT_STATUSES = [
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type ProjectSiteAddress = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
} | null;

export type Project = {
  id: string;
  workspace_id: string;
  code: string;
  name: string;
  client_id: string | null;
  status: ProjectStatus;
  site_address: ProjectSiteAddress;
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  currency: string;
  assigned_to: string | null;
  notes: string | null;
  custom_fields: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ProjectFilters = {
  search?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type ProjectListResult = {
  projects: Project[];
  count: number;
};

export type ProjectHealth = {
  quoted_total: number;
  invoiced_total: number;
  paid_total: number;
  delivered_count: number;
  delivery_total: number;
};
