"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/providers/toast-provider";
import { setInvoiceReferences } from "@/features/invoices/actions";

/**
 * The two reference numbers the invoice register (rekap) needs, which
 * nothing else in the document produces:
 *
 *   NO PO        the client's own purchase order number, so their AP can
 *                match our invoice to their commitment
 *   NO.SERI FPN  the Faktur Pajak serial, assigned by DJP after issue
 *
 * Both are editable at any point in the invoice's life, including after
 * payment — the serial usually arrives late, and refusing it then would
 * leave the register permanently incomplete.
 */
export function InvoiceReferencesPanel({
  workspaceId,
  invoiceId,
  customerPoNumber,
  taxInvoiceNumber,
}: {
  workspaceId: string;
  invoiceId: string;
  customerPoNumber: string | null;
  taxInvoiceNumber: string | null;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [po, setPo] = useState(customerPoNumber ?? "");
  const [fpn, setFpn] = useState(taxInvoiceNumber ?? "");

  const dirty =
    po.trim() !== (customerPoNumber ?? "").trim() ||
    fpn.trim() !== (taxInvoiceNumber ?? "").trim();

  function handleSave() {
    startTransition(async () => {
      const result = await setInvoiceReferences(workspaceId, invoiceId, {
        customer_po_number: po.trim() || null,
        tax_invoice_number: fpn.trim() || null,
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("References saved", "success");
    });
  }

  return (
    <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="customer-po">Customer PO No.</Label>
          <Input
            id="customer-po"
            value={po}
            onChange={(e) => setPo(e.target.value)}
            placeholder="The client's own PO number"
            className="font-mono text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tax-invoice">Faktur Pajak No. (NO.SERI FPN)</Label>
          <Input
            id="tax-invoice"
            value={fpn}
            onChange={(e) => setFpn(e.target.value)}
            placeholder="Assigned by DJP after issue"
            className="font-mono text-sm"
          />
        </div>
        {dirty && (
          <Button size="sm" disabled={isPending} onClick={handleSave}>
            Save references
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          Both appear in the invoice register export. Neither affects any
          total.
        </p>
    </div>
  );
}
