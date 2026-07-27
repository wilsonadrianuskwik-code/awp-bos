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
    const query = supabase
      .from(table)
      .select(`${columns}, ${PROJECT_JOIN}`)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null);
    return projectId ? query.eq("project_id", projectId) : query;
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
            "id, invoice_number, status, total, currency, created_at, client:clients(name)"
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

  return documents.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}
