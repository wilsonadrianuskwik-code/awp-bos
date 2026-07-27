"use server";

import { createClient } from "@/lib/supabase/server";
import { withWorkspace } from "@/lib/with-workspace";

export type SearchHit = {
  id: string;
  /** What to show as the primary line, e.g. "INV-20260727-011". */
  label: string;
  /** Secondary context, e.g. the client name. */
  detail: string | null;
  /** Route segment the record lives under, e.g. "invoices". */
  routeSegment: string;
  /** Which list this came from, shown as the group tag in the palette. */
  group: string;
};

// Each searchable record type: where to look, which columns identify it,
// and which columns are worth matching against. Adding a type here is the
// whole change — the palette renders whatever comes back.
const SOURCES = [
  {
    table: "quotations",
    group: "Quotations",
    routeSegment: "quotations",
    select: "id, quotation_number, title",
    labelColumn: "quotation_number",
    detailColumn: "title",
    searchColumns: ["quotation_number", "title"],
  },
  {
    table: "proforma_invoices",
    group: "Proforma Invoices",
    routeSegment: "proforma-invoices",
    select: "id, pi_number, title",
    labelColumn: "pi_number",
    detailColumn: "title",
    searchColumns: ["pi_number", "title"],
  },
  {
    table: "invoices",
    group: "Invoices",
    routeSegment: "invoices",
    select: "id, invoice_number, title",
    labelColumn: "invoice_number",
    detailColumn: "title",
    searchColumns: ["invoice_number", "title"],
  },
  {
    table: "purchase_orders",
    group: "Purchase Orders",
    routeSegment: "purchase-orders",
    select: "id, po_number, title",
    labelColumn: "po_number",
    detailColumn: "title",
    searchColumns: ["po_number", "title"],
  },
  {
    table: "delivery_orders",
    group: "Delivery Orders",
    routeSegment: "delivery-orders",
    select: "id, do_number",
    labelColumn: "do_number",
    detailColumn: null,
    searchColumns: ["do_number"],
  },
  {
    table: "projects",
    group: "Projects",
    routeSegment: "projects",
    select: "id, code, name",
    labelColumn: "code",
    detailColumn: "name",
    searchColumns: ["code", "name"],
  },
  {
    table: "clients",
    group: "Clients",
    routeSegment: "clients",
    select: "id, name, company",
    labelColumn: "name",
    detailColumn: "company",
    searchColumns: ["name", "company"],
  },
  {
    table: "suppliers",
    group: "Suppliers",
    routeSegment: "suppliers",
    select: "id, name, company",
    labelColumn: "name",
    detailColumn: "company",
    searchColumns: ["name", "company"],
  },
] as const;

/** Per-table cap. The palette is for jumping to a known record, not browsing. */
const PER_SOURCE_LIMIT = 4;

/**
 * Cross-entity lookup behind ⌘K: find a document by its number, or a
 * project/client/supplier by name.
 *
 * Previously the palette could only reach list pages, so finding one
 * invoice meant opening the list and filtering it down by hand — the
 * number was right there in the user's head and nowhere to type it.
 *
 * RLS still scopes every table to the caller's workspaces; the explicit
 * workspace_id filter narrows it to the active one.
 */
export async function searchWorkspace(workspaceId: string, query: string) {
  return withWorkspace(workspaceId, "viewer", async (ctx) => {
    const term = query.trim();
    if (term.length < 2) return [] as SearchHit[];

    // Escape PostgREST's or() delimiters so a comma or paren in the term
    // can't alter the filter it lands in.
    const safe = term.replace(/[,()\\]/g, " ").trim();
    if (!safe) return [] as SearchHit[];

    const supabase = await createClient();

    const results = await Promise.all(
      SOURCES.map(async (source) => {
        const filter = source.searchColumns
          .map((column) => `${column}.ilike.%${safe}%`)
          .join(",");

        const { data, error } = await supabase
          .from(source.table)
          .select(source.select)
          .eq("workspace_id", ctx.workspaceId)
          .is("deleted_at", null)
          .or(filter)
          .limit(PER_SOURCE_LIMIT);

        if (error || !data) return [] as SearchHit[];

        // The select list varies per source, so the generated row type
        // is a union the client can't narrow — the shape is guaranteed by
        // SOURCES itself.
        const rows = data as unknown as Record<string, string | null>[];

        return rows.map((row) => ({
          id: row.id as string,
          label: (row[source.labelColumn] as string) ?? "Untitled",
          detail: source.detailColumn ? row[source.detailColumn] : null,
          routeSegment: source.routeSegment,
          group: source.group,
        }));
      })
    );

    return results.flat();
  });
}
