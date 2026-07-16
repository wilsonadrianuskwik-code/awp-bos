import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format-currency";
import { getPaymentProgress } from "@/features/invoices/helpers";
import type { Invoice } from "@/features/invoices/types";

type OutstandingBalanceCardProps = {
  invoice: Pick<Invoice, "total" | "amount_paid" | "amount_due" | "currency" | "status">;
};

export function OutstandingBalanceCard({ invoice }: OutstandingBalanceCardProps) {
  const fmt = (value: number) => formatCurrency(value, invoice.currency);
  const progress = getPaymentProgress(invoice.amount_paid, invoice.total);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Balance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Outstanding Balance
          </p>
          <p className="text-3xl font-semibold tabular-nums tracking-tight">
            {fmt(invoice.amount_due)}
          </p>
        </div>

        {invoice.status === "partial" && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-amber-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="space-y-1.5 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="tabular-nums">{fmt(invoice.total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount Paid</span>
            <span className="tabular-nums">{fmt(invoice.amount_paid)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
