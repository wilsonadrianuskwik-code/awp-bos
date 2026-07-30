"use client";

import { useEffect, useRef, useState } from "react";
import type { LineItemTotals } from "@/features/line-items/helpers";
import { formatCurrency } from "@/lib/utils/format-currency";

type PricingSummaryProps = {
  totals: LineItemTotals;
  itemCount: number;
  sticky?: boolean;
};

// Tweens between the previous and next amount whenever the value changes,
// so editing a quantity makes the total roll to its new value instead of
// snapping — the live feedback that makes the builder feel like it's
// computing for you. Rendering always ends on the exact real value.
function useRollingAmount(value: number, durationMs = 350): number {
  const [display, setDisplay] = useState(value);
  // Tracks what's actually on screen so a change arriving mid-roll
  // continues from the visible amount rather than jumping.
  const displayRef = useRef(value);

  useEffect(() => {
    const from = displayRef.current;
    if (from === value) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }

    const start = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = t < 1 ? from + (value - from) * eased : value;
      displayRef.current = current;
      setDisplay(current);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return display;
}

export function PricingSummary({
  totals,
  itemCount,
  sticky = true,
}: PricingSummaryProps) {
  const fmt = (value: number) => formatCurrency(value);
  const rollingTotal = useRollingAmount(totals.total);

  return (
    <div className={sticky ? "lg:sticky lg:top-6" : ""}>
      <div className="overflow-hidden rounded-xl border bg-card shadow-2xs">
        <div className="p-5">
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Summary
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {itemCount} item{itemCount === 1 ? "" : "s"}
          </p>

          <div className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{fmt(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              {totals.discount_amount > 0 ? (
                <span className="tabular-nums text-red-600 dark:text-red-400">
                  −{fmt(totals.discount_amount)}
                </span>
              ) : (
                <span className="tabular-nums text-muted-foreground/60">
                  {fmt(0)}
                </span>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular-nums">{fmt(totals.tax_amount)}</span>
            </div>
          </div>
        </div>

        {/* The total lives on its own tinted footer surface so the one
            number that matters reads instantly, even at a glance from
            across the page. */}
        <div className="border-t bg-primary/[0.04] px-5 py-4 dark:bg-primary/[0.08]">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">Total</span>
            <span className="text-2xl font-semibold tabular-nums tracking-tight">
              {fmt(rollingTotal)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
