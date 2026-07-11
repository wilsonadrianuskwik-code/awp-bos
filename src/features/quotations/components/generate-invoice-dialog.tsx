"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { generateInvoiceFromQuotation } from "@/features/quotations/actions";
import { LineItemsTable } from "@/features/line-items/components/line-items-table";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { QuotationDetail } from "@/features/quotations/types";

type GenerateInvoiceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotation: QuotationDetail;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function GenerateInvoiceDialog({
  open,
  onOpenChange,
  quotation,
}: GenerateInvoiceDialogProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [step, setStep] = useState<"configure" | "review">("configure");
  const [invoiceDate, setInvoiceDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(
    addDays(todayISO(), quotation.client.payment_terms ?? 30)
  );
  const [copyNotes, setCopyNotes] = useState(true);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateInvoiceFromQuotation(
        workspace.id,
        quotation.id,
        { invoiceDate, dueDate, copyNotes }
      );
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Draft invoice created", "success");
      onOpenChange(false);
      setStep("configure");
      router.refresh();
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setStep("configure");
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        {step === "configure" ? (
          <>
            <DialogHeader>
              <DialogTitle>Generate Invoice</DialogTitle>
              <DialogDescription>
                Create a draft invoice from {quotation.quotation_number}. It
                is never sent automatically — finance reviews and sends it
                from Invoices.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Invoice date</Label>
                  <Input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Due date</Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={copyNotes}
                  onChange={(e) => setCopyNotes(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                Copy notes to invoice
              </label>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => setStep("review")}>Review</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Review Invoice</DialogTitle>
              <DialogDescription>
                Confirm the details below. This creates the invoice as a
                draft only — nothing is sent to the client.
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-96 space-y-4 overflow-y-auto text-sm">
              <div className="grid grid-cols-2 gap-4 rounded-lg border p-3">
                <div>
                  <p className="text-xs text-muted-foreground">Quotation</p>
                  <p className="font-medium">{quotation.quotation_number}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Client</p>
                  <p className="font-medium">{quotation.client.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Invoice date</p>
                  <p className="font-medium">{invoiceDate}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Due date</p>
                  <p className="font-medium">{dueDate}</p>
                </div>
              </div>

              <LineItemsTable
                lineItems={quotation.line_items}
                currency={quotation.currency}
              />

              <div className="flex justify-between rounded-lg border p-3 font-semibold">
                <span>Total</span>
                <span>{formatCurrency(quotation.total, quotation.currency)}</span>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setStep("configure")}
                disabled={isPending}
              >
                Back
              </Button>
              <Button onClick={handleGenerate} disabled={isPending}>
                {isPending ? "Generating..." : "Generate Draft Invoice"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
