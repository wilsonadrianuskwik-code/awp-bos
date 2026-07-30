"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils/cn";
import { SaveStatusPill, type SaveStatus } from "@/components/shared/save-status-pill";
import { formatCurrency } from "@/lib/utils/format-currency";
import { useRollingAmount } from "@/features/documents/hooks/use-rolling-amount";

type BuilderCommandBarProps = {
  /** Document identity, e.g. "New Invoice" or "Edit INV-2026-0001". */
  docLabel: string;
  saveStatus: SaveStatus;
  isDirty: boolean;
  /** Live grand total, recomputed by the parent on every edit. */
  total: number;
  isPending: boolean;
  /** Send-readiness: empty array = ready (green dot). Reasons show on
      hover of the dot, and when Send is clicked while unready. */
  readyReasons?: string[];
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
  isPending,
  readyReasons = [],
  onCancel,
  onSave,
  onSend,
  sendLabel = "Save & Send",
}: BuilderCommandBarProps) {
  const rolling = useRollingAmount(total);
  const [showReasons, setShowReasons] = useState(false);

  return (
    <div className="sticky top-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/85 py-2.5 pl-4 pr-2.5 shadow-2xs backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="truncate text-[15px] font-semibold tracking-tight">
          {docLabel}
        </h1>
        <span
          title={
            readyReasons.length === 0
              ? "Ready to send"
              : readyReasons.join(" · ")
          }
          className={cn(
            "h-2 w-2 shrink-0 rounded-full transition-colors duration-300",
            readyReasons.length === 0 ? "bg-emerald-500" : "bg-amber-400"
          )}
        />
        <SaveStatusPill status={saveStatus} isDirty={isDirty} />
      </div>

      <div className="flex items-center gap-3">
        {/* The running total — the one number the whole page exists to
            produce, always in view while editing. */}
        <span
          className="text-[15px] font-semibold tabular-nums tracking-tight"
          title="Current total"
        >
          {formatCurrency(rolling)}
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
          {readyReasons.length > 0 ? (
            <Popover open={showReasons} onOpenChange={setShowReasons}>
              <PopoverTrigger asChild>
                <Button type="button" size="sm" disabled={isPending}>
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  {sendLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-60 p-3.5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Before sending
                </p>
                <ul className="mt-2 space-y-1.5">
                  {readyReasons.map((reason) => (
                    <li
                      key={reason}
                      className="flex items-center gap-2 text-[13px]"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                      {reason}
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          ) : (
            <Button type="button" size="sm" onClick={onSend} disabled={isPending}>
              <Send className="mr-1.5 h-3.5 w-3.5" />
              {sendLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
