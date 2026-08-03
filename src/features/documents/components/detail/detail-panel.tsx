import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

/**
 * A content surface with compact padding — the tab bodies, the line
 * items table, the totals block.
 *
 * The document pages used to nest CardHeader (24px) + CardContent (24px)
 * around every block, so a three-line list cost ~120px of chrome. Panel
 * carries one padding scale and an optional inline heading instead.
 */
export function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  // min-w-0: a grid/flex item defaults to min-width:auto, so a wide
  // table inside would stretch the column instead of scrolling.
  return <Card className={cn("min-w-0 p-4 sm:p-5", className)}>{children}</Card>;
}

export function PanelHeader({
  title,
  hint,
  actions,
  className,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center justify-between gap-2",
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
        {hint && (
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      )}
    </div>
  );
}

/** A labelled fact. Used in the compact key-details grids. */
export function Fact({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[13px]">{children}</dd>
    </div>
  );
}

export function FactGrid({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4",
        className
      )}
    >
      {children}
    </dl>
  );
}
