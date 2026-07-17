"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, getCurrencyPrefix } from "@/lib/utils/format-currency";
import { useRollingAmount } from "@/features/documents/hooks/use-rolling-amount";
import type { LineItemInput } from "@/features/line-items/validators";
import type { LineItemCategory } from "@/features/line-items/types";

const CATEGORY_LABEL: Record<LineItemCategory, string> = {
  package: "Package",
  add_on: "Add-on",
  per_unit: "Per-unit",
};

// The quiet borderless field: reads as document text at rest, reveals an
// input affordance on hover, and only fully dresses as a field on focus.
const quietField =
  "h-7 rounded-md border border-transparent bg-transparent px-1.5 text-sm tabular-nums transition-colors duration-100 hover:border-input/60 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

type DisclosureRowProps = {
  item: LineItemInput;
  currency: string;
  /** The document-level tax default — a line matching it needs no badge. */
  docTaxDefault?: number;
  onChange: (patch: Partial<LineItemInput>) => void;
  onRemove: () => void;
  /** Enter in the description: commit this line, compose the next. */
  onEnter?: () => void;
  /** Backspace in an already-empty description: delete this line. */
  onBackspaceEmpty?: () => void;
  /** Parent asks this row to take the caret (newly composed rows). */
  requestFocus?: boolean;
  onFocusHandled?: () => void;
  /** "/" typed in an empty description: open the insert palette. */
  onSlashInsert?: () => void;
};

// The line-item atom of the document editor. At rest it reads as
// typography — description, qty × rate, amount — not as a grid of nine
// inputs. Unit, discount, tax, and category live behind the expand (⌄),
// shown only when a line needs an exception. The honesty rule: any value
// that moves the total while hidden (a discount, an off-default tax)
// surfaces as a badge at rest, so nothing changes the money invisibly.
export function DisclosureRow({
  item,
  currency,
  docTaxDefault = 0,
  onChange,
  onRemove,
  onEnter,
  onBackspaceEmpty,
  requestFocus,
  onFocusHandled,
  onSlashInsert,
}: DisclosureRowProps) {
  const [expanded, setExpanded] = useState(false);
  const descRef = useRef<HTMLInputElement>(null);
  const currencyPrefix = getCurrencyPrefix(currency);

  // Focus request from the parent (Enter-to-compose landed a new row, or
  // Backspace-delete moved the caret here). Caret goes to the end so
  // continuing to type feels like continuing the document.
  useEffect(() => {
    if (!requestFocus) return;
    const el = descRef.current;
    if (el) {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
    onFocusHandled?.();
  }, [requestFocus, onFocusHandled]);

  const itemSubtotal = item.quantity * item.unit_price;
  const discount = itemSubtotal * ((item.discount_percent ?? 0) / 100);
  // The row answers "what am I billing?" — tax is a document-level
  // concept the totals block explains, never the row. The amount shown
  // here is always the pre-tax line subtotal (post-discount); it rolls
  // when quantity/rate/discount change, but never moves when only the
  // document tax rate changes.
  const lineTotal = itemSubtotal - discount;
  const rollingLineTotal = useRollingAmount(lineTotal);

  const discountPct = item.discount_percent ?? 0;
  const taxPct = item.tax_percent ?? 0;
  const showDiscountBadge = discountPct > 0;
  const showTaxBadge = taxPct !== docTaxDefault;

  return (
    <div
      className={cn(
        "group rounded-md transition-colors duration-100 animate-in fade-in slide-in-from-bottom-1",
        expanded ? "bg-muted/30" : "hover:bg-muted/40"
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-2 py-1.5">
        {/* Description — the row's voice; document reading size. Enter
            composes the next line; Backspace on an empty line deletes it
            (the Notion editing grammar). */}
        <input
          ref={descRef}
          value={item.description}
          onChange={(e) => onChange({ description: e.target.value })}
          onKeyDown={(e) => {
            // Plain Enter only — ⌘/Ctrl+Enter belongs to the builder's
            // global save-and-send shortcut and must pass through.
            if (
              e.key === "Enter" &&
              !e.metaKey &&
              !e.ctrlKey &&
              item.description.trim() !== ""
            ) {
              e.preventDefault();
              onEnter?.();
            } else if (e.key === "Backspace" && item.description === "") {
              e.preventDefault();
              onBackspaceEmpty?.();
            } else if (
              e.key === "/" &&
              item.description === "" &&
              onSlashInsert
            ) {
              e.preventDefault();
              onSlashInsert();
            }
          }}
          placeholder="What are you charging for?"
          className="min-w-0 basis-full border-none bg-transparent py-1 text-[15px] outline-none placeholder:text-muted-foreground/40 md:basis-auto md:flex-1"
        />

        {/* Honesty badges: hidden values that move the total. */}
        {showDiscountBadge && (
          <span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-red-700 dark:bg-red-400/10 dark:text-red-400">
            −{discountPct}%
          </span>
        )}
        {showTaxBadge && (
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
            tax {taxPct}%
          </span>
        )}

        <div className="flex min-w-0 flex-1 items-center justify-end gap-x-2 md:flex-none">
          {/* Quantity and Unit travel together — "how much" of what — so
              the eye never has to jump across the row to connect them. */}
          <input
            type="number"
            value={item.quantity}
            onChange={(e) => onChange({ quantity: Number(e.target.value) || 0 })}
            min={0}
            step="0.01"
            className={cn(quietField, "w-14 text-right")}
            aria-label="Quantity"
          />
          <input
            value={item.unit ?? ""}
            onChange={(e) => onChange({ unit: e.target.value })}
            placeholder="unit"
            className={cn(quietField, "w-14 text-left")}
            aria-label="Unit"
          />
          <span className="shrink-0 text-[13px] text-muted-foreground/60">×</span>
          <div className="relative">
            {currencyPrefix && (
              <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/60">
                {currencyPrefix}
              </span>
            )}
            <input
              type="number"
              value={item.unit_price}
              onChange={(e) =>
                onChange({ unit_price: Number(e.target.value) || 0 })
              }
              min={0}
              step="0.01"
              className={cn(
                quietField,
                "w-32 text-right",
                currencyPrefix && "pl-8"
              )}
              aria-label="Unit price"
            />
          </div>

          {/* The amount: computed, never an input — and always the
              pre-tax line subtotal. Tax is a document concept; it only
              ever appears in the doc-level control and the totals block
              below, never here. */}
          <span className="w-28 shrink-0 text-right text-[15px] font-medium tabular-nums tracking-tight">
            {formatCurrency(rollingLineTotal, currency)}
          </span>

          {/* Row controls — whisper until hovered (always visible on touch). */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Hide details" : "Show details"}
            aria-expanded={expanded}
            className={cn(
              "grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-all duration-100 hover:bg-muted hover:text-foreground",
              expanded
                ? "opacity-100"
                : "md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
            )}
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-150",
                expanded && "rotate-180"
              )}
            />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove item"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-all duration-100 hover:bg-muted hover:text-destructive md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* The exception line: discount, tax, category — only when a row
          needs to deviate from the document defaults. Unit lives up in
          the main row beside Quantity; it's a billing fact, not an
          exception. */}
      {expanded && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-2 pb-2.5 pt-0.5 text-[13px] text-muted-foreground duration-150 animate-in fade-in">
          <label className="flex items-center gap-1.5">
            Discount
            <input
              type="number"
              value={discountPct}
              onChange={(e) =>
                onChange({ discount_percent: Number(e.target.value) || 0 })
              }
              min={0}
              max={100}
              className={cn(quietField, "w-14 border-input/60 text-right")}
            />
            %
          </label>
          <label className="flex items-center gap-1.5">
            Tax
            <input
              type="number"
              value={taxPct}
              onChange={(e) =>
                onChange({ tax_percent: Number(e.target.value) || 0 })
              }
              min={0}
              max={100}
              className={cn(quietField, "w-14 border-input/60 text-right")}
            />
            %
          </label>
          <label className="flex items-center gap-1.5">
            Category
            <Select
              value={item.category}
              onValueChange={(v) => onChange({ category: v as LineItemCategory })}
            >
              <SelectTrigger className="h-7 w-28 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_LABEL) as LineItemCategory[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
      )}
    </div>
  );
}
