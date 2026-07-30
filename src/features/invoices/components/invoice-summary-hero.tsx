import { SummaryHero } from "@/components/shared/summary-hero";
import { formatCurrency } from "@/lib/utils/format-currency";
import { getPaymentProgress } from "@/features/invoices/helpers";
import type { Invoice } from "@/features/invoices/types";

type InvoiceSummaryHeroProps = {
  invoice: Pick<
    Invoice,
    "total" | "amount_paid" | "amount_due" | "currency" | "status"
  >;
  actions: React.ReactNode;
};

export function InvoiceSummaryHero({ invoice, actions }: InvoiceSummaryHeroProps) {
  const fmt = (value: number) => formatCurrency(value);
  const progress = getPaymentProgress(invoice.amount_paid, invoice.total);
  const isPaid = invoice.status === "paid";
  const isOverdue = invoice.status === "overdue";

  return (
    <SummaryHero
      primaryLabel={isPaid ? "Amount Paid" : "Amount Due"}
      primaryValue={fmt(isPaid ? invoice.amount_paid : invoice.amount_due)}
      primaryTone={isPaid ? "success" : isOverdue ? "danger" : "default"}
      secondaryMetrics={[
        { label: "Total", value: fmt(invoice.total) },
        { label: "Paid", value: fmt(invoice.amount_paid) },
      ]}
      actions={actions}
      progress={{
        value: isPaid ? 100 : progress,
        tone: isPaid ? "success" : isOverdue ? "danger" : "default",
      }}
    />
  );
}
