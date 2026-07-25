import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Quotation,
  QuotationDetail,
  QuotationFilters,
  QuotationListResult,
  QuotationStats,
  QuotationWithClient,
} from "@/features/quotations/types";

const CLIENT_JOIN = "client:clients(id,name,company,email,payment_terms,phone,address,tax_id)";
// Read-only embed of the invoice generated from this quotation, if any —
// quotations.generated_invoice_id has a real FK to invoices(id)
// (fk_quotations_generated_invoice), so this embed is safe for PostgREST
// to traverse directly, unlike the auth.users-referencing columns
// elsewhere in this file.
const CONVERTED_INVOICE_JOIN = "converted_invoice:invoices!generated_invoice_id(id,invoice_number)";
const PROJECT_JOIN = "project:projects(id,code,name)";

export async function getQuotations(
  workspaceId: string,
  filters?: QuotationFilters
): Promise<QuotationListResult> {
  const supabase = await createClient();

  let query = supabase
    .from("quotations")
    .select(`*, ${CLIENT_JOIN}, ${CONVERTED_INVOICE_JOIN}, ${PROJECT_JOIN}`, { count: "exact" })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  if (filters?.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  if (filters?.clientId) {
    query = query.eq("client_id", filters.clientId);
  }

  if (filters?.search) {
    const term = filters.search.replace(/[%_]/g, "");
    const like = `%${term}%`;

    const { data: matchingClients } = await supabase
      .from("clients")
      .select("id")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .or(`name.ilike.${like},company.ilike.${like}`);

    const clientIds = (matchingClients ?? []).map((c) => c.id);

    const orClauses = [
      `title.ilike.${like}`,
      `quotation_number.ilike.${like}`,
      `internal_id.ilike.${like}`,
    ];
    if (clientIds.length > 0) {
      orClauses.push(`client_id.in.(${clientIds.join(",")})`);
    }
    query = query.or(orClauses.join(","));
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

  return {
    quotations: (data ?? []) as unknown as QuotationWithClient[],
    count: count ?? 0,
  };
}

export async function getQuotation(
  quotationId: string,
  workspaceId: string
): Promise<QuotationDetail | null> {
  const supabase = await createClient();

  // Only client:clients(...) is a genuine embed — quotations.client_id has
  // a real FK to clients(id). created_by/approved_by reference auth.users,
  // not profiles, so there is no relationship PostgREST can traverse for a
  // `profiles!created_by(...)` style embed; that select silently errors,
  // which previously made every quotation look "not found". Profiles are
  // fetched separately instead, same as line_items below.
  const { data: quotation, error } = await supabase
    .from("quotations")
    .select(`*, ${CLIENT_JOIN}, ${CONVERTED_INVOICE_JOIN}, ${PROJECT_JOIN}`)
    .eq("id", quotationId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .single();

  if (error || !quotation) return null;

  const profileIds = quotation.approved_by
    ? [quotation.created_by, quotation.approved_by]
    : [quotation.created_by];

  const [{ data: lineItems }, { data: profiles }] = await Promise.all([
    supabase
      .from("line_items")
      .select("*")
      .eq("entity_type", "quotation")
      .eq("entity_id", quotationId)
      .order("sort_order", { ascending: true }),
    supabase.from("profiles").select("id, full_name, avatar_url").in("id", profileIds),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return {
    ...quotation,
    line_items: lineItems ?? [],
    created_by_profile: profileById.get(quotation.created_by) ?? null,
    approved_by_profile: quotation.approved_by
      ? (profileById.get(quotation.approved_by) ?? null)
      : null,
  } as unknown as QuotationDetail;
}

export async function getQuotationActivities(quotationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("*, actor:profiles!actor_id(full_name, avatar_url)")
    .eq("entity_type", "quotation")
    .eq("entity_id", quotationId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
}

export async function getQuotationVersions(
  quotationId: string,
  workspaceId: string
): Promise<QuotationWithClient[]> {
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("quotations")
    .select("id, parent_quotation_id")
    .eq("id", quotationId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!current) return [];

  const rootId = current.parent_quotation_id ?? current.id;

  const { data } = await supabase
    .from("quotations")
    .select(`*, ${CLIENT_JOIN}, ${CONVERTED_INVOICE_JOIN}, ${PROJECT_JOIN}`)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .or(`id.eq.${rootId},parent_quotation_id.eq.${rootId}`)
    .order("version", { ascending: true });

  return (data ?? []) as unknown as QuotationWithClient[];
}

export async function getQuotationsByClient(
  clientId: string,
  workspaceId: string
): Promise<Quotation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("quotations")
    .select("*")
    .eq("client_id", clientId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  return (data ?? []) as Quotation[];
}

/**
 * Reads a quotation by its public share_token for the unauthenticated
 * customer portal. Uses the admin (service role) client deliberately —
 * there is no `quotations` RLS SELECT policy for anon/customer access;
 * the share_token itself (a capability URL) is the access control here,
 * not row-level security.
 */
export async function getQuotationByShareToken(
  shareToken: string
): Promise<{ quotation: QuotationDetail; workspaceName: string } | null> {
  const supabase = createAdminClient();

  const { data: quotation, error } = await supabase
    .from("quotations")
    .select(`*, ${CLIENT_JOIN}`)
    .eq("share_token", shareToken)
    .is("deleted_at", null)
    .single();

  if (error || !quotation) return null;

  const profileIds = quotation.approved_by
    ? [quotation.created_by, quotation.approved_by]
    : [quotation.created_by];

  const [{ data: lineItems }, { data: workspace }, { data: profiles }] =
    await Promise.all([
      supabase
        .from("line_items")
        .select("*")
        .eq("entity_type", "quotation")
        .eq("entity_id", quotation.id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("workspaces")
        .select("name")
        .eq("id", quotation.workspace_id)
        .single(),
      supabase.from("profiles").select("id, full_name, avatar_url").in("id", profileIds),
    ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return {
    quotation: {
      ...quotation,
      line_items: lineItems ?? [],
      created_by_profile: profileById.get(quotation.created_by) ?? null,
      approved_by_profile: quotation.approved_by
        ? (profileById.get(quotation.approved_by) ?? null)
        : null,
    } as unknown as QuotationDetail,
    workspaceName: workspace?.name ?? "",
  };
}

/**
 * Workspace-wide quotation stats for the module's KPI ribbon — deliberately
 * unfiltered by the list page's current search/status/page so the numbers
 * mean "the whole module," not "what's on screen." Selects only
 * status/total/currency and reduces in JS, same technique as the
 * dashboard's getInvoiceSummary/getRevenueSummary.
 */
export async function getQuotationStats(workspaceId: string): Promise<QuotationStats> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_quotation_stats", { p_workspace_id: workspaceId });

  return (
    (data as QuotationStats | null) ?? {
      totalCount: 0,
      draftCount: 0,
      awaitingApprovalCount: 0,
      approvedCount: 0,
      totalValueByCurrency: [],
    }
  );
}
