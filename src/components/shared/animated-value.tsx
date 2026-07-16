"use client";

import { useEffect, useRef, useState } from "react";

// Counts a formatted value up on first paint by tweening every digit run
// in the string while leaving separators/symbols in place — so
// "Rp 42.500.000 · $3,000" animates without re-implementing currency
// formatting. Deterministic: the final frame IS the exact original
// string. Skipped for reduced-motion users. Shared by the dashboard's
// KPI tiles and the revenue hero.
export function AnimatedValue({
  value,
  className,
  durationMs = 700,
}: {
  value: string;
  className?: string;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState(value);
  const animatedFor = useRef<string | null>(null);

  useEffect(() => {
    if (animatedFor.current === value) return;
    animatedFor.current = value;

    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !/\d/.test(value)
    ) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    let frame: number;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(
        value.replace(/\d+/g, (run) => {
          const scaled = String(Math.round(Number(run) * eased));
          // Constant run width so layout never shifts while counting.
          return scaled.padStart(run.length, "0");
        })
      );
      if (t < 1) frame = requestAnimationFrame(tick);
      else setDisplay(value);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return (
    <span className={className} title={value}>
      {display}
    </span>
  );
}
