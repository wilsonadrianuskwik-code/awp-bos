import type { QuotationTotals } from "@/features/quotations/helpers";

type PricingSummaryProps = {
  totals: QuotationTotals;
  currency: string;
  itemCount: number;
  sticky?: boolean;
};

export function PricingSummary({
  totals,
  currency,
  itemCount,
  sticky = true,
}: PricingSummaryProps) {
  const fmt = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      value
    );

  return (
    <div className={sticky ? "lg:sticky lg:top-6" : ""}>
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold text-muted-foreground">
          Summary
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {itemCount} item{itemCount === 1 ? "" : "s"}
        </p>

        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{fmt(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Discount</span>
            <span className="tabular-nums text-red-600 dark:text-red-400">
              −{fmt(totals.discount_amount)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax</span>
            <span className="tabular-nums">{fmt(totals.tax_amount)}</span>
          </div>
        </div>

        <div className="mt-4 border-t pt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">Total</span>
            <span className="text-2xl font-bold tabular-nums tracking-tight">
              {fmt(totals.total)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
