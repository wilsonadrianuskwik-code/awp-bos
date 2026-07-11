"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { deletePayment } from "@/features/invoices/actions";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { PaymentWithRecorder } from "@/features/invoices/types";

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  credit_card: "Credit Card",
  cash: "Cash",
  check: "Check",
  paypal: "PayPal",
  stripe: "Stripe",
  other: "Other",
};

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
  const [isPending, startTransition] = useTransition();

  function handleDelete(payment: PaymentWithRecorder) {
    if (!confirm(`Delete payment ${payment.payment_number}? This cannot be undone.`))
      return;
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
            <p className="font-semibold tabular-nums">
              {formatCurrency(payment.amount, payment.currency)}
              <span className="ml-1.5 font-normal text-muted-foreground">
                via {PAYMENT_METHOD_LABEL[payment.payment_method] ?? payment.payment_method}
              </span>
            </p>
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
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
