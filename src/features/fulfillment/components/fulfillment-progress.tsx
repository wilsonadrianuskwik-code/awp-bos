import { AlertTriangle } from "lucide-react";

type FulfillmentProgressProps = {
  purchased: number;
  delivered: number;
  remaining: number;
  progressPercent: number;
  isOverDelivered: boolean;
  unitLabel?: string | null;
};

// Shared bar treatment across the ledger, detail page, invoice-detail
// section, and client-detail card — same visual convention as the ranked
// bars in ar-aging-card.tsx/catalog-revenue-card.tsx (h-2 rounded-full
// track + fill), not a new component pattern.
export function FulfillmentProgress({
  purchased,
  delivered,
  remaining,
  progressPercent,
  isOverDelivered,
  unitLabel,
}: FulfillmentProgressProps) {
  const unit = unitLabel ? ` ${unitLabel}` : "";

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          {delivered} of {purchased}{unit} delivered
          {remaining > 0 ? ` · ${remaining} remaining` : ""}
        </span>
        {isOverDelivered && (
          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            Over-delivered
          </span>
        )}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={
            isOverDelivered
              ? "h-full rounded-full bg-amber-500"
              : "h-full rounded-full bg-primary"
          }
          style={{ width: `${Math.min(100, progressPercent)}%` }}
        />
      </div>
    </div>
  );
}
