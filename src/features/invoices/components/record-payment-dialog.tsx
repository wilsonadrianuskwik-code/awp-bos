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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { useConfirm } from "@/providers/confirm-provider";
import { recordPayment } from "@/features/invoices/actions";
import { recordPaymentSchema } from "@/features/invoices/validators";
import { BANK_OPTIONS, PAYMENT_METHOD_LABEL } from "@/features/invoices/helpers";
import { PAYMENT_METHODS, type Invoice, type PaymentMethod } from "@/features/invoices/types";
import { formatCurrency } from "@/lib/utils/format-currency";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

type RecordPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice;
};

export function RecordPaymentDialog({
  open,
  onOpenChange,
  invoice,
}: RecordPaymentDialogProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  const [amount, setAmount] = useState(String(invoice.amount_due));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank_transfer");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [bankName, setBankName] = useState<string>(BANK_OPTIONS[0]);
  const [customBankName, setCustomBankName] = useState("");
  const [receiverAccountName, setReceiverAccountName] = useState("");

  function reset() {
    setAmount(String(invoice.amount_due));
    setPaymentMethod("bank_transfer");
    setPaymentDate(todayISO());
    setReference("");
    setNotes("");
    setBankName(BANK_OPTIONS[0]);
    setCustomBankName("");
    setReceiverAccountName("");
  }

  async function handleSave() {
    const resolvedBankName = bankName === "Other" ? customBankName : bankName;

    const payload = {
      amount,
      currency: invoice.currency,
      payment_method: paymentMethod,
      payment_date: paymentDate,
      reference,
      notes,
      bank_name: paymentMethod === "bank_transfer" ? resolvedBankName : "",
      receiver_account_name:
        paymentMethod === "bank_transfer" ? receiverAccountName : "",
    };

    const parsed = recordPaymentSchema.safeParse(payload);
    if (!parsed.success) {
      toast(parsed.error.issues[0].message, "error");
      return;
    }

    if (parsed.data.amount > invoice.amount_due) {
      const overage = parsed.data.amount - invoice.amount_due;
      const ok = await confirm({
        title: "Payment exceeds the outstanding balance",
        description: `This payment is ${formatCurrency(overage)} more than the ${formatCurrency(invoice.amount_due)} still owed on ${invoice.invoice_number}. Record it anyway?`,
        confirmLabel: "Record Payment",
      });
      if (!ok) return;
    }

    startTransition(async () => {
      const result = await recordPayment(workspace.id, invoice.id, parsed.data);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Payment recorded", "success");
      reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Log a payment received for {invoice.invoice_number}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Amount *</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input value={invoice.currency} disabled />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Payment method *</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_METHOD_LABEL[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Payment date *</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
          </div>

          {paymentMethod === "bank_transfer" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Bank name *</Label>
                <Select value={bankName} onValueChange={setBankName}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BANK_OPTIONS.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {bankName === "Other" && (
                  <Input
                    className="mt-2"
                    value={customBankName}
                    onChange={(e) => setCustomBankName(e.target.value)}
                    placeholder="Bank name"
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label>Receiver account name</Label>
                <Input
                  value={receiverAccountName}
                  onChange={(e) => setReceiverAccountName(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Reference</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Transaction ID, check number, etc."
            />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Recording..." : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
