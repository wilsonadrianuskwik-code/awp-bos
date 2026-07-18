"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { useConfirm } from "@/providers/confirm-provider";
import { deletePayment } from "@/features/invoices/actions";
import { PAYMENT_METHOD_LABEL } from "@/features/invoices/helpers";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { PaymentWithRecorder } from "@/features/invoices/types";

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type PaymentHistoryProps = {
  payments: PaymentWithRecorder[];
};

export function PaymentHistory({ payments }: PaymentHistoryProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  async function handleDelete(payment: PaymentWithRecorder) {
    const ok = await confirm({
      title: `Delete payment ${payment.payment_number}?`,
      description: "This cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deletePayment(workspace.id, payment.id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Payment deleted", "success");
      router.refresh();
    });
  }

  if (payments.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No payments recorded yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {payments.map((payment) => (
        <div
          key={payment.id}
          className="flex items-start justify-between gap-3 rounded-lg border p-3"
        >
          <div className="min-w-0 space-y-0.5 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {payment.payment_number}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDate(payment.payment_date)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <p className="font-semibold tabular-nums">
                {formatCurrency(payment.amount, payment.currency)}
              </p>
              <Badge variant="secondary">
                {PAYMENT_METHOD_LABEL[payment.payment_method]}
              </Badge>
            </div>
            {payment.bank_name && (
              <p className="text-xs text-muted-foreground">
                {payment.bank_name}
                {payment.receiver_account_name
                  ? ` · ${payment.receiver_account_name}`
                  : ""}
              </p>
            )}
            {payment.reference && (
              <p className="text-xs text-muted-foreground">
                Ref: {payment.reference}
              </p>
            )}
            {payment.notes && (
              <p className="text-xs text-muted-foreground">{payment.notes}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Recorded by {payment.recorded_by_profile?.full_name ?? "Unknown"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => handleDelete(payment)}
            disabled={isPending}
            aria-label="Delete payment"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
