"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The name a printed document saves under:
 *
 *   AWP-P-11072026-214 - PT Duta Rama - Rp 1.683.037
 *
 * Number first, because that is what a saved file gets looked up by —
 * against the register, against the client's remittance advice, against
 * the paper copy. Client and amount follow so a folder of PDFs can be
 * scanned without opening any of them.
 *
 * The amount is omitted for documents that carry no money (Delivery
 * Orders), rather than printing a misleading zero.
 */
export function documentFilename(
  documentNumber: string,
  partyName: string | null | undefined,
  total?: string
): string {
  const parts = [documentNumber, partyName?.trim() || null, total ?? null];
  return sanitizeFilename(parts.filter(Boolean).join(" - "));
}

/**
 * Strips what a filesystem won't accept. Slashes become hyphens rather
 * than vanishing: document numbers are full of them, and deleting them
 * turned "AWP-P/11072026-214" into "AWP-P11072026-214", which no longer
 * matches what is printed on the document.
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\]/g, "-")
    .replace(/[<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Prints the page under `filename`, restoring the document title after. */
export function printDocument(filename: string) {
  const prevTitle = document.title;
  document.title = sanitizeFilename(filename);
  window.print();
  document.title = prevTitle;
}

/**
 * Triggers the browser print dialog, naming the PDF after the document so
 * a saved file is identifiable without opening it — matching what the
 * Invoice and Quotation pages already do inline.
 */
export function PrintButton({
  filename,
  size = "default",
}: {
  filename: string;
  /** "sm" to match the compact document toolbars. */
  size?: "default" | "sm";
}) {
  return (
    <Button
      variant="outline"
      size={size}
      onClick={() => printDocument(filename)}
    >
      <Printer className={size === "sm" ? "mr-1.5 h-3.5 w-3.5" : "mr-2 h-4 w-4"} />
      Print
    </Button>
  );
}
