import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { QuotationDetail } from "@/features/quotations/types";

type QuotationSummaryHeroProps = {
  quotation: Pick<
    QuotationDetail,
    "total" | "currency" | "expiry_date" | "line_items" | "status"
  >;
  /** The status/lifecycle action buttons (QuotationStatusActions). */
  actions: React.ReactNode;
};

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// The quotation's headline value, promoted to a full-width band: the
// quoted Total leads at display scale with item count and validity
// beside it, and the lifecycle actions (Send / Approve / Generate
// Invoice …) live in the same band — so the number, its terms, and the
// next step read together instead of the total hiding in a sidebar card.
export function QuotationSummaryHero({
  quotation,
  actions,
}: QuotationSummaryHeroProps) {
  const expired =
    quotation.expiry_date &&
    new Date(quotation.expiry_date) < new Date() &&
    quotation.status !== "approved";

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-1 flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Quoted Total
            </p>
            <p className="mt-1.5 text-4xl font-semibold tabular-nums tracking-tight">
              {formatCurrency(quotation.total, quotation.currency)}
            </p>
          </div>
          <div className="flex gap-x-10">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Line Items
              </p>
              <p className="mt-1.5 text-lg font-medium tabular-nums">
                {quotation.line_items.length}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Valid Until
              </p>
              <p className="mt-1.5 text-lg font-medium tabular-nums">
                {formatDate(quotation.expiry_date)}
                {expired && (
                  <span className="ml-1.5 align-middle text-xs font-medium uppercase tracking-wide text-red-600 dark:text-red-400">
                    Expired
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      </div>
    </Card>
  );
}
