"use client";

import { useEffect, useRef, useState } from "react";

// Tweens between the previous and next amount whenever the value changes,
// so recomputed money rolls to its new value instead of snapping — the
// "quiet accountant" feedback that makes edits feel computed, not pasted.
// Always settles on the exact real value; skipped for reduced motion.
// Shared by the builder command bar total and every DisclosureRow amount.
export function useRollingAmount(value: number, durationMs = 350): number {
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
