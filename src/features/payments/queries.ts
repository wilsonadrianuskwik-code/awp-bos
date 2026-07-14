import { createClient } from "@/lib/supabase/server";
import type { PaymentWithContext, PaymentFilters } from "@/features/payments/types";

const INVOICE_JOIN =
  "invoice:invoices(id,invoice_number,status,client:clients(id,name))";

/**
 * Workspace-wide payments ledger. `payments.workspace_id` is a direct
 * column (not just reachable through invoice_id), so scoping is a plain
 * single-table filter; the invoice/client embed below traverses two real
 * FKs (payments.invoice_id -> invoices.id, invoices.client_id ->
 * clients.id) in one PostgREST call — same style already used for
 * invoices' own client join (CLIENT_JOIN in invoices/queries.ts).
 *
 * Search (payment number / invoice number / client name) and the
 * clientId filter both need to match against the *joined* invoice/client,
 * which PostgREST's `.or()` can't reliably filter two embed levels deep.
 * Instead we resolve matching invoice ids via small preliminary lookups
 * and filter the main query by invoice_id — the same style this codebase
 * already uses for auth.users lookups it can't embed directly.
 */
export async function getPayments(
  workspaceId: string,
  filters: PaymentFilters = {}
): Promise<PaymentWithContext[]> {
  const supabase = await createClient();

  // Hard scope: only this client's invoices. Resolved eagerly so an
  // empty match can short-circuit before ever touching `payments` (an
  // empty `.in()` list is invalid PostgREST syntax, not just "no rows").
  if (filters.clientId) {
    const { data: clientInvoices } = await supabase
      .from("invoices")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("client_id", filters.clientId);

    const clientInvoiceIds = (clientInvoices ?? []).map((r) => r.id);
    if (clientInvoiceIds.length === 0) return [];

    return getPaymentsForInvoiceIds(supabase, workspaceId, filters, clientInvoiceIds);
  }

  return getPaymentsForInvoiceIds(supabase, workspaceId, filters, null);
}

async function getPaymentsForInvoiceIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  filters: PaymentFilters,
  restrictToInvoiceIds: string[] | null
): Promise<PaymentWithContext[]> {
  let searchInvoiceIds: string[] = [];
  if (filters.search) {
    const like = `%${sanitizeLike(filters.search)}%`;
    const [{ data: byNumber }, { data: byClient }] = await Promise.all([
      supabase
        .from("invoices")
        .select("id")
        .eq("workspace_id", workspaceId)
        .ilike("invoice_number", like),
      supabase
        .from("invoices")
        .select("id, client:clients!inner(name)")
        .eq("workspace_id", workspaceId)
        .ilike("client.name", like),
    ]);
    const ids = new Set<string>();
    (byNumber ?? []).forEach((r) => ids.add(r.id));
    (byClient ?? []).forEach((r) => ids.add(r.id));
    searchInvoiceIds = [...ids];
  }

  let query = supabase
    .from("payments")
    .select(`*, ${INVOICE_JOIN}`)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  if (restrictToInvoiceIds) {
    query = query.in("invoice_id", restrictToInvoiceIds);
  }
  if (filters.from) query = query.gte("payment_date", filters.from);
  if (filters.to) query = query.lte("payment_date", filters.to);
  if (filters.currency) query = query.eq("currency", filters.currency);
  if (filters.method && filters.method !== "all") {
    query = query.eq("payment_method", filters.method);
  }

  if (filters.search) {
    const like = `%${sanitizeLike(filters.search)}%`;
    query =
      searchInvoiceIds.length > 0
        ? query.or(
            `payment_number.ilike.${like},invoice_id.in.(${searchInvoiceIds.join(",")})`
          )
        : query.ilike("payment_number", like);
  }

  const { data, error } = await query.order("payment_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PaymentWithContext[];
}

function sanitizeLike(term: string): string {
  return term.replace(/[%_]/g, "");
}
