import { createClient } from "@/lib/supabase/server";
import type { LeadFilters, LeadListResult } from "@/features/leads/types";

export async function getLeads(
  workspaceId: string,
  filters?: LeadFilters
): Promise<LeadListResult> {
  const supabase = await createClient();

  let query = supabase
    .from("leads")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  if (filters?.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  if (filters?.search) {
    const term = filters.search.replace(/[%_]/g, "");
    const like = `%${term}%`;
    query = query.or(`name.ilike.${like},company.ilike.${like},email.ilike.${like}`);
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

  return { leads: data ?? [], count: count ?? 0 };
}

// Workspace-wide counts for the KPI ribbon — independent of the current
// page's filters, using count-only (head: true) queries so no rows are
// transferred for the tallies.
export async function getLeadStats(workspaceId: string) {
  const supabase = await createClient();

  const activeStatuses = ["new", "contacted", "qualified", "proposal", "negotiation"];
  const qualifiedStatuses = ["qualified", "proposal", "negotiation"];

  const countQuery = (status?: string | string[]) => {
    let q = supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null);
    if (Array.isArray(status)) q = q.in("status", status);
    else if (status) q = q.eq("status", status);
    return q;
  };

  const [
    { count: totalCount },
    { count: activeCount },
    { count: newCount },
    { count: qualifiedCount },
    { count: wonCount },
    { count: lostCount },
  ] = await Promise.all([
    countQuery(),
    countQuery(activeStatuses),
    countQuery("new"),
    countQuery(qualifiedStatuses),
    countQuery("won"),
    countQuery("lost"),
  ]);

  const closedCount = (wonCount ?? 0) + (lostCount ?? 0);
  const conversionRate = closedCount > 0 ? Math.round(((wonCount ?? 0) / closedCount) * 100) : 0;

  return {
    totalCount: totalCount ?? 0,
    activeCount: activeCount ?? 0,
    newCount: newCount ?? 0,
    qualifiedCount: qualifiedCount ?? 0,
    wonCount: wonCount ?? 0,
    closedCount,
    conversionRate,
  };
}

export async function getLead(leadId: string, workspaceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .single();

  if (error) return null;
  return data;
}

export async function getLeadActivities(leadId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("*, actor:profiles!actor_id(full_name, avatar_url)")
    .eq("entity_type", "lead")
    .eq("entity_id", leadId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
}
