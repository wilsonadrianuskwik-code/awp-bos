"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Triggers the browser print dialog, naming the PDF after the document so
 * a saved file is identifiable without opening it — matching what the
 * Invoice and Quotation pages already do inline.
 */
export function PrintButton({ filename }: { filename: string }) {
  function handlePrint() {
    const safe = filename.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();
    const prevTitle = document.title;
    document.title = safe;
    window.print();
    document.title = prevTitle;
  }

  return (
    <Button variant="outline" onClick={handlePrint}>
      <Printer className="mr-2 h-4 w-4" />
      Print
    </Button>
  );
}
