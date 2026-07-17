import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format-currency";
import { getPaymentProgress } from "@/features/invoices/helpers";
import { cn } from "@/lib/utils/cn";
import type { Invoice } from "@/features/invoices/types";

type InvoiceSummaryHeroProps = {
  invoice: Pick<
    Invoice,
    "total" | "amount_paid" | "amount_due" | "currency" | "status"
  >;
  /** The status/payment action buttons (InvoiceStatusActions). */
  actions: React.ReactNode;
};

// The invoice's financial headline, promoted from a sidebar card to a
// full-width band: Amount Due leads at display scale, Total and Paid sit
// beside it, a progress bar spans the whole width, and the primary
// actions live in the same band — so "what's owed / what's been paid /
// what to do next" all read in one glance instead of three places.
export function InvoiceSummaryHero({ invoice, actions }: InvoiceSummaryHeroProps) {
  const fmt = (value: number) => formatCurrency(value, invoice.currency);
  const progress = getPaymentProgress(invoice.amount_paid, invoice.total);
  const isPaid = invoice.status === "paid";
  const isOverdue = invoice.status === "overdue";

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-1 flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {isPaid ? "Amount Paid" : "Amount Due"}
            </p>
            <p
              className={cn(
                "mt-1.5 text-4xl font-semibold tabular-nums tracking-tight",
                isOverdue && "text-red-600 dark:text-red-400",
                isPaid && "text-emerald-600 dark:text-emerald-400"
              )}
            >
              {fmt(isPaid ? invoice.amount_paid : invoice.amount_due)}
            </p>
          </div>
          <div className="flex gap-x-10">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Total
              </p>
              <p className="mt-1.5 text-lg font-medium tabular-nums">
                {fmt(invoice.total)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Paid
              </p>
              <p className="mt-1.5 text-lg font-medium tabular-nums">
                {fmt(invoice.amount_paid)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      </div>

      {/* Payment progress spans the full band foot — a quiet, always-on
          read of how close this invoice is to settled. */}
      <div className="h-1.5 w-full bg-muted">
        <div
          className={cn(
            "h-full transition-[width] duration-500",
            isPaid ? "bg-emerald-500" : isOverdue ? "bg-red-500" : "bg-amber-500"
          )}
          style={{ width: `${isPaid ? 100 : progress}%` }}
        />
      </div>
    </Card>
  );
}
