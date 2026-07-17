import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AnimatedValue } from "@/components/shared/animated-value";
import { cn } from "@/lib/utils/cn";

export type RibbonMetric = {
  label: string;
  value: string;
  description?: string;
  href?: string;
  tone?: "default" | "danger";
};

// A single card carrying every top-line metric as divided columns —
// Stripe's dashboard header bar, not a row of floating tiles. One
// surface, hairline rules between cells, so the numbers read as a set
// rather than six competing boxes.
export function StatRibbon({ metrics }: { metrics: RibbonMetric[] }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-y overflow-hidden rounded-xl border bg-card sm:grid-cols-3 lg:flex lg:divide-y-0">
      {metrics.map((m) => {
        const body = (
          <div className="flex h-full flex-col justify-between p-4 lg:p-5">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {m.label}
              </span>
              {m.href && (
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
              )}
            </div>
            <div className="mt-3">
              <AnimatedValue
                value={m.value}
                className={cn(
                  "block truncate text-2xl font-semibold tracking-tight tabular-nums",
                  m.tone === "danger" && "text-red-600 dark:text-red-400"
                )}
              />
              {m.description && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {m.description}
                </p>
              )}
            </div>
          </div>
        );

        // lg:flex-1 makes every cell claim equal width in the horizontal
        // strip; min-w-0 lets long currency values truncate instead of
        // blowing out the row.
        const cellClass = "min-w-0 lg:flex-1";

        return m.href ? (
          <Link
            key={m.label}
            href={m.href}
            className={cn(
              "group outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40",
              cellClass
            )}
          >
            {body}
          </Link>
        ) : (
          <div key={m.label} className={cellClass}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
