import { sanitizeSearchTerm } from "@/lib/utils/search-term";
import { createClient } from "@/lib/supabase/server";
import type { ClientFilters, ClientListResult } from "@/features/clients/types";

export async function getClients(
  workspaceId: string,
  filters?: ClientFilters
): Promise<ClientListResult> {
  const supabase = await createClient();

  let query = supabase
    .from("clients")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  if (filters?.search) {
    const term = sanitizeSearchTerm(filters.search);
    const like = `%${term}%`;
    query = query.or(
      `name.ilike.${like},company.ilike.${like},email.ilike.${like},phone.ilike.${like}`
    );
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

  return { clients: data ?? [], count: count ?? 0 };
}

// Workspace-wide counts for the KPI ribbon — independent of the current
// page's filters. Uses count-only (head: true) queries so no rows are
// actually transferred, matching the cost profile of getInvoiceStats/etc.
export async function getClientStats(workspaceId: string) {
  const supabase = await createClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ count: totalCount }, { count: newThisMonthCount }] = await Promise.all([
    supabase
      .from("clients")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null),
    supabase
      .from("clients")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .gte("created_at", thirtyDaysAgo),
  ]);

  return {
    totalCount: totalCount ?? 0,
    newThisMonthCount: newThisMonthCount ?? 0,
  };
}

export async function getAllClients(workspaceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getClient(clientId: string, workspaceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .single();

  if (error) return null;
  return data;
}

export async function getClientActivities(clientId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("*, actor:profiles!actor_id(full_name, avatar_url)")
    .eq("entity_type", "client")
    .eq("entity_id", clientId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
}
