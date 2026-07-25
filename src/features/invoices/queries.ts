import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Invoice,
  InvoiceDetail,
  InvoiceFilters,
  InvoiceListResult,
  InvoiceStats,
  InvoiceWithClient,
  Payment,
} from "@/features/invoices/types";

const CLIENT_JOIN = "client:clients(id,name,company,email,payment_terms,phone,address,tax_id)";
// Read-only embed of the quotation this invoice was generated from, if
// any — invoices.source_quotation_id is a real FK to quotations(id), so
// (unlike the auth.users-referencing columns elsewhere in this file) this
// embed is safe for PostgREST to traverse directly.
const SOURCE_QUOTATION_JOIN = "source_quotation:quotations!source_quotation_id(id,quotation_number)";
const PROJECT_JOIN = "project:projects(id,code,name)";

export async function getInvoices(
  workspaceId: string,
  filters?: InvoiceFilters
): Promise<InvoiceListResult> {
  const supabase = await createClient();

  let query = supabase
    .from("invoices")
    .select(`*, ${CLIENT_JOIN}, ${SOURCE_QUOTATION_JOIN}, ${PROJECT_JOIN}`, { count: "exact" })
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
      `invoice_number.ilike.${like}`,
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
    invoices: (data ?? []) as unknown as InvoiceWithClient[],
    count: count ?? 0,
  };
}

export async function getInvoice(
  invoiceId: string,
  workspaceId: string
): Promise<InvoiceDetail | null> {
  const supabase = await createClient();

  // Only client:clients(...) is a genuine embed — invoices.client_id has a
  // real FK to clients(id). created_by references auth.users, not
  // profiles, so there is no relationship PostgREST can traverse for a
  // `profiles!created_by(...)` style embed — that select silently errors
  // (the P0 lesson from the quotation feature). Profiles are fetched
  // separately instead, same as line_items/payments below.
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(`*, ${CLIENT_JOIN}, ${SOURCE_QUOTATION_JOIN}, ${PROJECT_JOIN}`)
    .eq("id", invoiceId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .single();

  if (error || !invoice) return null;

  const [{ data: lineItems }, { data: payments }] = await Promise.all([
    supabase
      .from("line_items")
      .select("*")
      .eq("entity_type", "invoice")
      .eq("entity_id", invoiceId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("payments")
      .select("*")
      .eq("invoice_id", invoiceId)
      .is("deleted_at", null)
      .order("payment_date", { ascending: true }),
  ]);

  // payments.recorded_by references auth.users, not profiles — same P0
  // lesson as invoices.created_by, so profiles are fetched separately
  // rather than via a `profiles!recorded_by(...)` embed.
  const profileIds = Array.from(
    new Set([invoice.created_by, ...(payments ?? []).map((p) => p.recorded_by)])
  );
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .in("id", profileIds);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return {
    ...invoice,
    line_items: lineItems ?? [],
    payments: (payments ?? []).map((p) => ({
      ...p,
      recorded_by_profile: profileById.get(p.recorded_by) ?? null,
    })),
    created_by_profile: profileById.get(invoice.created_by) ?? null,
  } as unknown as InvoiceDetail;
}

export async function getInvoiceActivities(invoiceId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("*, actor:profiles!actor_id(full_name, avatar_url)")
    .eq("entity_type", "invoice")
    .eq("entity_id", invoiceId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
}

export async function getPayments(invoiceId: string): Promise<Payment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payments")
    .select("*")
    .eq("invoice_id", invoiceId)
    .is("deleted_at", null)
    .order("payment_date", { ascending: true });

  return (data ?? []) as Payment[];
}

export async function getInvoicesByClient(
  clientId: string,
  workspaceId: string
): Promise<Invoice[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("*")
    .eq("client_id", clientId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  return (data ?? []) as Invoice[];
}

/**
 * Reads an invoice by its public share_token for the unauthenticated
 * customer portal. Uses the admin (service role) client deliberately —
 * there is no `invoices` RLS SELECT policy for anon/customer access; the
 * share_token itself (a capability URL) is the access control here, not
 * row-level security. Mirrors getQuotationByShareToken.
 */
export async function getInvoiceByShareToken(
  shareToken: string
): Promise<{ invoice: InvoiceDetail; workspaceName: string } | null> {
  const supabase = createAdminClient();

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(`*, ${CLIENT_JOIN}`)
    .eq("share_token", shareToken)
    .is("deleted_at", null)
    .single();

  if (error || !invoice) return null;

  const [{ data: lineItems }, { data: payments }, { data: workspace }] =
    await Promise.all([
      supabase
        .from("line_items")
        .select("*")
        .eq("entity_type", "invoice")
        .eq("entity_id", invoice.id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("payments")
        .select("*")
        .eq("invoice_id", invoice.id)
        .is("deleted_at", null)
        .order("payment_date", { ascending: true }),
      supabase
        .from("workspaces")
        .select("name")
        .eq("id", invoice.workspace_id)
        .single(),
    ]);

  const profileIds = Array.from(
    new Set([invoice.created_by, ...(payments ?? []).map((p) => p.recorded_by)])
  );
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .in("id", profileIds);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return {
    invoice: {
      ...invoice,
      line_items: lineItems ?? [],
      payments: (payments ?? []).map((p) => ({
        ...p,
        recorded_by_profile: profileById.get(p.recorded_by) ?? null,
      })),
      created_by_profile: profileById.get(invoice.created_by) ?? null,
    } as unknown as InvoiceDetail,
    workspaceName: workspace?.name ?? "",
  };
}

/**
 * Workspace-wide invoice stats for the module's KPI ribbon — deliberately
 * unfiltered by the list page's current search/status/page so the numbers
 * mean "the whole module," not "what's on screen." Selects only
 * status/total/currency and reduces in JS, same technique as the
 * dashboard's getInvoiceSummary/getRevenueSummary.
 */
export async function getInvoiceStats(workspaceId: string): Promise<InvoiceStats> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_invoice_stats", { p_workspace_id: workspaceId });

  return (
    (data as InvoiceStats | null) ?? {
      totalCount: 0,
      draftCount: 0,
      outstandingCount: 0,
      paidCount: 0,
      totalValueByCurrency: [],
    }
  );
}
