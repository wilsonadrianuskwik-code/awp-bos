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

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/**
 * Numbers go out unformatted — no thousands separators, no currency
 * symbol — so the spreadsheet reads them as numbers rather than text.
 * Formatting is the workbook's job; a "Rp 20.020.200" string in a cell
 * that should be summed is worse than useless.
 */
function num(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

export function buildRegisterRow(doc: AnyDocument): string[] {
  const hargaJual = doc.harga_jual ?? null;
  const paid = doc.amount_paid ?? null;
  const total = doc.total ?? null;

  return [
    formatDate(doc.issue_date ?? doc.created_at),
    doc.customer_po_number ?? "",
    doc.number,
    doc.tax_invoice_number ?? "",
    doc.party ?? "",
    doc.description ?? "",
    num(hargaJual),
    // PTG DP and BIAYA ADM have no field behind them yet — the column is
    // emitted so the sheet's shape matches, and left for the accountant
    // to fill until we know whether they should alter the total.
    "",
    num(doc.dpp_amount),
    num(doc.ppn_amount),
    num(doc.pph_amount),
    num(doc.retensi_amount),
    "",
    num(total),
    // PAYMENT is what the customer has actually paid; TERIMA is the date
    // that payment came in.
    num(paid),
    formatDate(doc.payment_date ?? null),
    // PLUS/MINUS: paid against billed. Negative is short-paid, positive
    // is over-paid, blank when nothing has been paid yet.
    total != null && paid != null ? String(Math.round((paid - total) * 100) / 100) : "",
  ];
}

/**
 * RFC 4180 quoting, with a UTF-8 BOM and semicolon separator.
 *
 * The semicolon is deliberate: Excel picks its field separator from the
 * system list separator, which is ";" under Indonesian regional
 * settings. A comma-separated file opens there as one column per row.
 * The BOM is what makes Excel read it as UTF-8 rather than mangling
 * accented characters.
 */
export function toCsv(headers: readonly string[], rows: string[][]): string {
  const escape = (cell: string) =>
    /[";\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  const lines = [headers, ...rows].map((row) => row.map(escape).join(";"));
  return `﻿${lines.join("\r\n")}`;
}

/** Triggers a browser download without a round trip to the server. */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
