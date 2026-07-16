"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

type StatCardProps = {
  title: string;
  value: string;
  description?: string;
};

// Counts the value up on first paint by tweening every digit run in the
// formatted string while leaving separators/symbols in place — so
// "Rp 42.500.000 · $3,000" animates without re-implementing any currency
// formatting. Deterministic: the final frame IS the exact original
// string. Skipped entirely for reduced-motion users.
function useCountUp(target: string, durationMs = 700): string {
  const [display, setDisplay] = useState(target);
  const animatedFor = useRef<string | null>(null);

  useEffect(() => {
    if (animatedFor.current === target) return;
    animatedFor.current = target;

    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !/\d/.test(target)
    ) {
      setDisplay(target);
      return;
    }

    const start = performance.now();
    let frame: number;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out cubic — settles gently instead of stopping dead.
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(
        target.replace(/\d+/g, (run) => {
          const scaled = String(Math.round(Number(run) * eased));
          // Keep the run's width constant so the layout never shifts
          // while counting.
          return scaled.padStart(run.length, "0");
        })
      );
      if (t < 1) frame = requestAnimationFrame(tick);
      else setDisplay(target);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return display;
}

// KPI tile: quiet uppercase label above a prominent tabular-nums value —
// the number is the content, the label is orientation. The hover lift is
// subtle (border tint, no translate) since these tiles aren't clickable;
// it just makes the dashboard feel alive under the cursor.
export function StatCard({ title, value, description }: StatCardProps) {
  const display = useCountUp(value);
  return (
    <Card className="transition-colors duration-150 hover:border-primary/25">
      <CardContent className="p-5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <p className="mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums" title={value}>
          {display}
        </p>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
