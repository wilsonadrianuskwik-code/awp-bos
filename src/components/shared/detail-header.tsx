import { BackButton } from "@/components/shared/back-button";

type DetailHeaderProps = {
  backHref: string;
  backLabel: string;
  title: string;
  /** Inline elements shown to the right of the title — status badge,
   *  version chip, type badges. Kept beside the title (not below it) so
   *  the record's state reads in the same place on every entity. */
  badges?: React.ReactNode;
  /** Secondary line under the title — company, SKU, "number · client",
   *  optionally with an inline copy affordance. */
  subtitle?: React.ReactNode;
  /** Right-aligned action cluster (primary + secondary buttons). */
  actions?: React.ReactNode;
};

// The single header used by every entity detail page. Guarantees an
// identical back control, title hierarchy, badge placement, action
// alignment, spacing, and responsive stacking across Leads, Clients,
// Catalog, Quotations, Invoices, and Fulfillment — so a detail page reads
// the same no matter which module it belongs to.
export function DetailHeader({
  backHref,
  backLabel,
  title,
  badges,
  subtitle,
  actions,
}: DetailHeaderProps) {
  return (
    <div className="space-y-4">
      <BackButton href={backHref} label={backLabel} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {badges}
          </div>
          {subtitle && (
            <div className="text-sm text-muted-foreground">{subtitle}</div>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
