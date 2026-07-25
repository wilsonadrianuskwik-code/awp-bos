import { createClient } from "@/lib/supabase/server";
import type {
  Project,
  ProjectFilters,
  ProjectHealth,
  ProjectListResult,
} from "@/features/projects/types";

export async function getProjects(
  workspaceId: string,
  filters?: ProjectFilters
): Promise<ProjectListResult> {
  const supabase = await createClient();

  let query = supabase
    .from("projects")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  if (filters?.search) {
    const term = filters.search.replace(/[%_]/g, "");
    const like = `%${term}%`;
    query = query.or(`name.ilike.${like},code.ilike.${like}`);
  }

  const sortBy = filters?.sortBy ?? "created_at";
  const sortDir = filters?.sortDir ?? "desc";
  query = query.order(sortBy, { ascending: sortDir === "asc" });

  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  return { projects: (data ?? []) as Project[], count: count ?? 0 };
}

// Workspace-wide counts for the KPI ribbon — independent of the current
// page's filters, matching getClientStats' cost profile (head-only
// counts, no rows transferred).
export async function getProjectStats(workspaceId: string) {
  const supabase = await createClient();

  const [{ count: totalCount }, { count: activeCount }] = await Promise.all([
    supabase
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null),
    supabase
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .eq("status", "active"),
  ]);

  return {
    totalCount: totalCount ?? 0,
    activeCount: activeCount ?? 0,
  };
}

export async function getAllProjects(workspaceId: string): Promise<Project[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getProjectById(
  projectId: string,
  workspaceId: string
): Promise<Project | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .single();

  if (error) return null;
  return data;
}

export async function getProjectActivities(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("*, actor:profiles!actor_id(full_name, avatar_url)")
    .eq("entity_type", "project")
    .eq("entity_id", projectId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
}

export async function getProjectHealth(
  projectId: string,
  workspaceId: string
): Promise<ProjectHealth> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_project_health", {
    p_project_id: projectId,
    p_workspace_id: workspaceId,
  });

  if (error) throw error;
  return (
    (data as ProjectHealth) ?? {
      quoted_total: 0,
      invoiced_total: 0,
      paid_total: 0,
      delivered_count: 0,
      delivery_total: 0,
    }
  );
}

// Document types mirroring "documents linked to this project" — used by
// the Project detail page's Documents tab. Each source table is queried
// independently (they're not a single physical table) and merged
// client-side into one array with a document_type discriminator.
export type ProjectDocument = {
  id: string;
  document_type:
    | "quotation"
    | "invoice"
    | "purchase_order"
    | "proforma_invoice"
    | "delivery_order";
  number: string;
  status: string;
  total: number | null;
  currency: string | null;
  created_at: string;
};

export async function getProjectDocuments(
  projectId: string,
  workspaceId: string
): Promise<ProjectDocument[]> {
  const supabase = await createClient();

  const [quotations, invoices, purchaseOrders, proformaInvoices, deliveryOrders] =
    await Promise.all([
      supabase
        .from("quotations")
        .select("id, quotation_number, status, total, currency, created_at")
        .eq("workspace_id", workspaceId)
        .eq("project_id", projectId)
        .is("deleted_at", null),
      supabase
        .from("invoices")
        .select("id, invoice_number, status, total, currency, created_at")
        .eq("workspace_id", workspaceId)
        .eq("project_id", projectId)
        .is("deleted_at", null),
      supabase
        .from("purchase_orders")
        .select("id, po_number, status, total, currency, created_at")
        .eq("workspace_id", workspaceId)
        .eq("project_id", projectId)
        .is("deleted_at", null),
      supabase
        .from("proforma_invoices")
        .select("id, pi_number, status, total, currency, created_at")
        .eq("workspace_id", workspaceId)
        .eq("project_id", projectId)
        .is("deleted_at", null),
      supabase
        .from("delivery_orders")
        .select("id, do_number, status, created_at")
        .eq("workspace_id", workspaceId)
        .eq("project_id", projectId)
        .is("deleted_at", null),
    ]);

  const documents: ProjectDocument[] = [
    ...(quotations.data ?? []).map((q) => ({
      id: q.id,
      document_type: "quotation" as const,
      number: q.quotation_number,
      status: q.status,
      total: q.total,
      currency: q.currency,
      created_at: q.created_at,
    })),
    ...(invoices.data ?? []).map((i) => ({
      id: i.id,
      document_type: "invoice" as const,
      number: i.invoice_number,
      status: i.status,
      total: i.total,
      currency: i.currency,
      created_at: i.created_at,
    })),
    ...(purchaseOrders.data ?? []).map((p) => ({
      id: p.id,
      document_type: "purchase_order" as const,
      number: p.po_number,
      status: p.status,
      total: p.total,
      currency: p.currency,
      created_at: p.created_at,
    })),
    ...(proformaInvoices.data ?? []).map((p) => ({
      id: p.id,
      document_type: "proforma_invoice" as const,
      number: p.pi_number,
      status: p.status,
      total: p.total,
      currency: p.currency,
      created_at: p.created_at,
    })),
    ...(deliveryOrders.data ?? []).map((d) => ({
      id: d.id,
      document_type: "delivery_order" as const,
      number: d.do_number,
      status: d.status,
      total: null,
      currency: null,
      created_at: d.created_at,
    })),
  ];

  documents.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return documents;
}
