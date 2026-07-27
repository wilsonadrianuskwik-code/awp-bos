import { createClient } from "@/lib/supabase/server";
import { logDbError } from "@/lib/log-db-error";
import type {
  AnyDocument,
  DocumentType,
} from "@/features/documents/document-types";

export type { AnyDocument, DocumentType } from "@/features/documents/document-types";

export type DocumentFilters = {
  projectId?: string;
  documentType?: DocumentType;
  /** Free text over document number and client/supplier name. */
  search?: string;
  /** Document date range, inclusive, as YYYY-MM-DD. */
  dateFrom?: string;
  dateTo?: string;
  /** Total value range. */
  amountMin?: number;
  amountMax?: number;
  /** Payment received date range, inclusive. Invoices only. */
  paidFrom?: string;
  paidTo?: string;
  status?: string;
};

/**
 * Every document in the workspace, across all five types, as one list.
 *
 * The five document types live in five tables (a deliberate choice — see
 * the plan's rejection of a single polymorphic documents table), so a
 * combined view has to fan out and merge. That is fine at this scale:
 * five indexed, workspace-scoped queries run in parallel, and both
 * filters push down into them rather than being applied after the fact.
 *
 * Mirrors getProjectDocuments (features/projects/queries.ts), which does
 * the same fan-out for a single project; this one adds the project and
 * counterparty columns a cross-project view needs to stay readable.
 */
export async function getAllDocuments(
  workspaceId: string,
  filters: DocumentFilters = {}
): Promise<AnyDocument[]> {
  const supabase = await createClient();
  const { projectId, documentType } = filters;

  const PROJECT_JOIN = "project:projects(id,code,name)";
  const wants = (type: DocumentType) => !documentType || documentType === type;

  // Each table's query is built the same way: workspace-scoped, alive,
  // and narrowed to one project when that filter is set. A type filtered
  // out is never queried at all.
  function build(table: string, columns: string) {
    let query = supabase
      .from(table)
      .select(`${columns}, ${PROJECT_JOIN}`)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null);

    if (projectId) query = query.eq("project_id", projectId);
    if (filters.status) query = query.eq("status", filters.status);
    // created_at is a timestamp; the "to" bound is pushed to the end of
    // that day so an inclusive range reads the way a user means it.
    if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
    if (filters.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);
    // Delivery orders carry no total, so an amount filter would exclude
    // all of them — which is the right behaviour, but only when the user
    // actually set one.
    if (filters.amountMin != null) query = query.gte("total", filters.amountMin);
    if (filters.amountMax != null) query = query.lte("total", filters.amountMax);

    return query;
  }

  const [quotations, proformas, invoices, purchaseOrders, deliveryOrders] =
    await Promise.all([
      wants("quotation")
        ? build(
            "quotations",
            "id, quotation_number, status, total, currency, created_at, client:clients(name)"
          )
        : null,
      wants("proforma_invoice")
        ? build(
            "proforma_invoices",
            "id, pi_number, status, total, currency, created_at, client:clients(name)"
          )
        : null,
      wants("invoice")
        ? build(
            "invoices",
            "id, invoice_number, status, total, currency, created_at, issue_date, title, summary, subtotal, discount_amount, dpp_amount, ppn_amount, pph_amount, retensi_amount, amount_paid, customer_po_number, tax_invoice_number, client:clients(name), payments(payment_date)"
          )
        : null,
      wants("purchase_order")
        ? build(
            "purchase_orders",
            "id, po_number, status, total, currency, created_at, supplier:suppliers(name)"
          )
        : null,
      wants("delivery_order")
        ? build(
            "delivery_orders",
            "id, do_number, status, created_at, client:clients(name)"
          )
        : null,
    ]);

  for (const [label, result] of [
    ["quotations", quotations],
    ["proforma_invoices", proformas],
    ["invoices", invoices],
    ["purchase_orders", purchaseOrders],
    ["delivery_orders", deliveryOrders],
  ] as const) {
    if (result?.error) {
      logDbError(`getAllDocuments:${label}`, result.error, { workspaceId });
    }
  }

  // The select list is assembled at runtime, so PostgREST's type-level
  // parser can't infer row shapes here. Each type's columns are asserted
  // explicitly below instead.
  type Row = Record<string, unknown>;
  const named = (row: Row, key: string) =>
    (row[key] as { name: string } | null)?.name ?? null;
  const projectOf = (row: Row) =>
    (row.project as AnyDocument["project"]) ?? null;

  // TERIMA is when the money arrived. With partial payments there are
  // several dates; the register wants the most recent one.
  const latestPaymentDate = (row: Row): string | null => {
    const payments = (row.payments as { payment_date: string }[] | null) ?? [];
    if (payments.length === 0) return null;
    return payments
      .map((p) => p.payment_date)
      .sort()
      .at(-1) ?? null;
  };

  const documents: AnyDocument[] = [
    ...((quotations?.data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id as string,
      document_type: "quotation" as const,
      number: r.quotation_number as string,
      status: r.status as string,
      total: r.total as number,
      currency: r.currency as string,
      created_at: r.created_at as string,
      project: projectOf(r),
      party: named(r, "client"),
    })),
    ...((proformas?.data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id as string,
      document_type: "proforma_invoice" as const,
      number: r.pi_number as string,
      status: r.status as string,
      total: r.total as number,
      currency: r.currency as string,
      created_at: r.created_at as string,
      project: projectOf(r),
      party: named(r, "client"),
    })),
    ...((invoices?.data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id as string,
      document_type: "invoice" as const,
      number: r.invoice_number as string,
      status: r.status as string,
      total: r.total as number,
      currency: r.currency as string,
      created_at: r.created_at as string,
      project: projectOf(r),
      party: named(r, "client"),
      issue_date: r.issue_date as string,
      description: (r.title as string) || (r.summary as string) || null,
      // Harga jual is the pre-tax figure the register wants: lines less
      // line discounts, before any PPN.
      harga_jual: (r.subtotal as number) - (r.discount_amount as number),
      dpp_amount: r.dpp_amount as number,
      ppn_amount: r.ppn_amount as number,
      pph_amount: r.pph_amount as number,
      retensi_amount: r.retensi_amount as number,
      amount_paid: r.amount_paid as number,
      customer_po_number: (r.customer_po_number as string) ?? null,
      tax_invoice_number: (r.tax_invoice_number as string) ?? null,
      payment_date: latestPaymentDate(r),
    })),
    ...((purchaseOrders?.data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id as string,
      document_type: "purchase_order" as const,
      number: r.po_number as string,
      status: r.status as string,
      total: r.total as number,
      currency: r.currency as string,
      created_at: r.created_at as string,
      project: projectOf(r),
      party: named(r, "supplier"),
    })),
    // Delivery Orders carry no money — the invoice they belong to does.
    ...((deliveryOrders?.data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id as string,
      document_type: "delivery_order" as const,
      number: r.do_number as string,
      status: r.status as string,
      total: null,
      currency: null,
      created_at: r.created_at as string,
      project: projectOf(r),
      party: named(r, "client"),
    })),
  ];

  // Two filters are applied after the merge rather than pushed down.
  // Search spans a joined name and the number column, which differs per
  // table; payment dates come from a nested relation only invoices have.
  // Both would need five bespoke query shapes to push down, for a set
  // already narrowed by workspace, project, type and date.
  let result = documents;

  if (filters.search) {
    const term = filters.search.trim().toLowerCase();
    result = result.filter(
      (doc) =>
        doc.number.toLowerCase().includes(term) ||
        (doc.party ?? "").toLowerCase().includes(term) ||
        (doc.customer_po_number ?? "").toLowerCase().includes(term) ||
        (doc.tax_invoice_number ?? "").toLowerCase().includes(term)
    );
  }

  if (filters.paidFrom || filters.paidTo) {
    result = result.filter((doc) => {
      if (!doc.payment_date) return false;
      if (filters.paidFrom && doc.payment_date < filters.paidFrom) return false;
      if (filters.paidTo && doc.payment_date > filters.paidTo) return false;
      return true;
    });
  }

  return result.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}
