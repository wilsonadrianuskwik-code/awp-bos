"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  function handlePrint() {
    const safe = filename.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();
    const prevTitle = document.title;
    document.title = safe;
    window.print();
    document.title = prevTitle;
  }

  return (
    <Button variant="outline" size={size} onClick={handlePrint}>
      <Printer className={size === "sm" ? "mr-1.5 h-3.5 w-3.5" : "mr-2 h-4 w-4"} />
      Print
    </Button>
  );
}
