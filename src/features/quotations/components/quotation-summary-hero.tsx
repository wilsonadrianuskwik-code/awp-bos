import { SummaryHero } from "@/components/shared/summary-hero";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { QuotationDetail } from "@/features/quotations/types";

type QuotationSummaryHeroProps = {
  quotation: Pick<
    QuotationDetail,
    "total" | "currency" | "expiry_date" | "line_items" | "status"
  >;
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

export function QuotationSummaryHero({
  quotation,
  actions,
}: QuotationSummaryHeroProps) {
  const expired =
    quotation.expiry_date &&
    new Date(quotation.expiry_date) < new Date() &&
    quotation.status !== "approved";

  const validUntilValue = (
    <>
      {formatDate(quotation.expiry_date)}
      {expired && (
        <span className="ml-1.5 align-middle text-xs font-medium uppercase tracking-wide text-red-600 dark:text-red-400">
          Expired
        </span>
      )}
    </>
  );

  return (
    <SummaryHero
      primaryLabel="Quoted Total"
      primaryValue={formatCurrency(quotation.total)}
      secondaryMetrics={[
        { label: "Line Items", value: String(quotation.line_items.length) },
        { label: "Valid Until", value: validUntilValue },
      ]}
      actions={actions}
    />
  );
}
