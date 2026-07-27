import type { AnyDocument } from "@/features/documents/document-types";

/**
 * The invoice register (rekap) columns, in the order the company's
 * existing spreadsheet uses. Exported files have to drop straight into
 * that workbook, so the order and the headings are fixed — including the
 * Indonesian spellings and the rates baked into the labels.
 */
export const REGISTER_COLUMNS = [
  "TANGGAL",
  "NO PO",
  "NO INV",
  "NO.SERI FPN",
  "BILL TO",
  "DESKRIPSI",
  "HARGA JUAL TANPA PPN",
  "PTG DP",
  "DPP 11/12",
  "PPN 12%",
  "PPH23 2%",
  "RETENSI 5%",
  "BIAYA ADM",
  "TOTAL",
  "PAYMENT",
  "TERIMA",
  "PLUS/MINUS",
] as const;

/** Index of the first money column — everything from here is numeric. */
export const FIRST_AMOUNT_COLUMN = 6;

export type RegisterCell = string | number | Date | null;

/**
 * One register row as typed values rather than strings.
 *
 * Dates stay Date and amounts stay number so the spreadsheet can sort,
 * sum and re-format them. Turning them into text at this layer is what
 * makes an exported register something you can only look at.
 */
export function registerValues(doc: AnyDocument): RegisterCell[] {
  const total = doc.total ?? null;
  const paid = doc.amount_paid ?? null;

  return [
    toDate(doc.issue_date ?? doc.created_at),
    doc.customer_po_number ?? null,
    doc.number,
    doc.tax_invoice_number ?? null,
    doc.party ?? null,
    doc.description ?? null,
    doc.harga_jual ?? null,
    // PTG DP and BIAYA ADM have no field behind them yet — the column is
    // emitted so the sheet's shape matches, and left for the accountant
    // to fill until we know whether they should alter the total.
    null,
    doc.dpp_amount ?? null,
    doc.ppn_amount ?? null,
    doc.pph_amount ?? null,
    doc.retensi_amount ?? null,
    null,
    total,
    // PAYMENT is what the customer has actually paid; TERIMA is the date
    // that payment came in.
    paid,
    toDate(doc.payment_date ?? null),
    // PLUS/MINUS: paid against billed. Negative is short-paid, positive
    // is over-paid, blank when nothing has been paid yet.
    total != null && paid != null ? Math.round((paid - total) * 100) / 100 : null,
  ];
}

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Display form of a cell, for the printed register. */
export function formatRegisterCell(cell: RegisterCell): string {
  if (cell == null) return "";
  if (cell instanceof Date) {
    return `${String(cell.getDate()).padStart(2, "0")}/${String(
      cell.getMonth() + 1
    ).padStart(2, "0")}/${cell.getFullYear()}`;
  }
  if (typeof cell === "number") {
    return new Intl.NumberFormat("id-ID").format(cell);
  }
  return cell;
}

/** The row as strings, for the printed/PDF register table. */
export function buildRegisterRow(doc: AnyDocument): string[] {
  return registerValues(doc).map(formatRegisterCell);
}
