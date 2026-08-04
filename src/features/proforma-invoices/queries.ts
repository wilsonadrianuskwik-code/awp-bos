import { sanitizeSearchTerm } from "@/lib/utils/search-term";
import { createClient } from "@/lib/supabase/server";
import { logDbError } from "@/lib/log-db-error";
import type {
  ProformaInvoiceDetail,
  ProformaInvoiceFilters,
  ProformaInvoiceListResult,
  ProformaInvoiceWithClient,
  DocumentRelationship,
} from "@/features/proforma-invoices/types";

const CLIENT_JOIN = "client:clients(id,name,company,email,payment_terms,phone,address,tax_id)";
// generated_invoice_id has a real FK to invoices(id), safe for PostgREST
// to traverse directly (same pattern as quotations' converted_invoice).
const GENERATED_INVOICE_JOIN = "generated_invoice:invoices!generated_invoice_id(id,invoice_number)";

export async function getProformaInvoices(
  workspaceId: string,
  filters?: ProformaInvoiceFilters
): Promise<ProformaInvoiceListResult> {
  const supabase = await createClient();

  let query = supabase
    .from("proforma_invoices")
    .select(`*, ${CLIENT_JOIN}, ${GENERATED_INVOICE_JOIN}`, { count: "exact" })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  if (filters?.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  if (filters?.clientId) {
    query = query.eq("client_id", filters.clientId);
  }

  if (filters?.search) {
    const term = sanitizeSearchTerm(filters.search);
    const like = `%${term}%`;

    const { data: matchingClients } = await supabase
      .from("clients")
      .select("id")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .or(`name.ilike.${like},company.ilike.${like}`);

    const clientIds = (matchingClients ?? []).map((c) => c.id);

    const orClauses = [`title.ilike.${like}`, `pi_number.ilike.${like}`];
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
  if (error) {
    logDbError("getProformaInvoices", error, { workspaceId });
    throw new Error(error.message);
  }

  return {
    proformaInvoices: (data ?? []) as unknown as ProformaInvoiceWithClient[],
    count: count ?? 0,
  };
}

export async function getProformaInvoice(
  piId: string,
  workspaceId: string
): Promise<ProformaInvoiceDetail | null> {
  const supabase = await createClient();

  const { data: pi, error } = await supabase
    .from("proforma_invoices")
    .select(`*, ${CLIENT_JOIN}, ${GENERATED_INVOICE_JOIN}`)
    .eq("id", piId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .single();

  if (error) {
    if (error.code !== "PGRST116") {
      logDbError("getProformaInvoice", error, { piId, workspaceId });
    }
    return null;
  }
  if (!pi) return null;

  const { data: lineItems } = await supabase
    .from("line_items")
    .select("*")
    .eq("entity_type", "proforma_invoice")
    .eq("entity_id", piId)
    .order("sort_order", { ascending: true });

  return {
    ...pi,
    line_items: lineItems ?? [],
  } as unknown as ProformaInvoiceDetail;
}

export async function getProformaInvoiceActivities(piId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("*, actor:profiles!actor_id(full_name, avatar_url)")
    .eq("entity_type", "proforma_invoice")
    .eq("entity_id", piId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
}

export async function getProformaInvoiceRelationships(
  workspaceId: string,
  piId: string
): Promise<DocumentRelationship[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_document_relationships", {
    p_workspace_id: workspaceId,
    p_document_type: "proforma_invoice",
    p_document_id: piId,
  });

  if (error) {
    logDbError("getProformaInvoiceRelationships (rpc get_document_relationships)", error, { piId, workspaceId });
    return [];
  }
  return (data ?? []) as DocumentRelationship[];
}

// Workspace-wide stats for the module's KPI ribbon — plain aggregate query,
// mirroring quotations' getQuotationStats but without a dedicated RPC
// (none was seeded for proforma_invoices).
export async function getProformaInvoiceStats(workspaceId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("proforma_invoices")
    .select("status, total, currency")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  const rows = data ?? [];
  const totalValueByCurrency = new Map<string, number>();
  for (const row of rows) {
    totalValueByCurrency.set(
      row.currency,
      (totalValueByCurrency.get(row.currency) ?? 0) + Number(row.total)
    );
  }

  return {
    totalCount: rows.length,
    draftCount: rows.filter((r) => r.status === "draft").length,
    sentCount: rows.filter((r) => r.status === "sent").length,
    acceptedCount: rows.filter((r) => r.status === "accepted").length,
    totalValueByCurrency: Array.from(totalValueByCurrency.entries()).map(
      ([currency, amount]) => ({ currency, amount })
    ),
  };
}
