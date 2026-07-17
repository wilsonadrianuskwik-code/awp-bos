"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SaveStatusPill, type SaveStatus } from "@/components/shared/save-status-pill";
import { formatCurrency } from "@/lib/utils/format-currency";

// Tweens between the previous and next amount whenever the value changes,
// so edits make the figure roll to its new value instead of snapping.
// Always settles on the exact real value; skipped for reduced motion.
function useRollingAmount(value: number, durationMs = 350): number {
  const [display, setDisplay] = useState(value);
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

type BuilderCommandBarProps = {
  /** Document identity, e.g. "New Invoice" or "Edit INV-2026-0001". */
  docLabel: string;
  saveStatus: SaveStatus;
  isDirty: boolean;
  /** Live grand total, recomputed by the parent on every edit. */
  total: number;
  currency: string;
  isPending: boolean;
  onCancel: () => void;
  onSave: () => void;
  /** The existing ⌘⏎ save-and-send path, surfaced as a visible button. */
  onSend: () => void;
  /** Verb for the primary action, e.g. "Send" (invoice) / "Send" (quotation). */
  sendLabel?: string;
};

// The builder's single command surface: identity + live save state on the
// left, the running total and every exit/commit action on the right —
// pinned while the document scrolls, so the money and the next step are
// never out of sight. Pure presentation: all behavior is injected.
export function BuilderCommandBar({
  docLabel,
  saveStatus,
  isDirty,
  total,
  currency,
  isPending,
  onCancel,
  onSave,
  onSend,
  sendLabel = "Save & Send",
}: BuilderCommandBarProps) {
  const rolling = useRollingAmount(total);

  return (
    <div className="sticky top-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/85 py-2.5 pl-4 pr-2.5 shadow-2xs backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="truncate text-[15px] font-semibold tracking-tight">
          {docLabel}
        </h1>
        <SaveStatusPill status={saveStatus} isDirty={isDirty} />
      </div>

      <div className="flex items-center gap-3">
        {/* The running total — the one number the whole page exists to
            produce, always in view while editing. */}
        <span
          className="text-[15px] font-semibold tabular-nums tracking-tight"
          title="Current total"
        >
          {formatCurrency(rolling, currency)}
        </span>

        <span className="hidden text-xs text-muted-foreground 2xl:block">
          <kbd className="rounded border px-1 py-0.5">⌘S</kbd> save ·{" "}
          <kbd className="rounded border px-1 py-0.5">⌘⏎</kbd> send
        </span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSave}
            disabled={isPending}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Draft
          </Button>
          <Button type="button" size="sm" onClick={onSend} disabled={isPending}>
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {sendLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
