"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { PackageBreakdown } from "@/features/catalog/components/package-breakdown";
import type { LineItemInput } from "@/features/line-items/validators";
import type { LineItemCategory } from "@/features/line-items/types";
import type { CatalogItem } from "@/features/catalog/types";

const CATEGORY_LABEL: Record<LineItemCategory, string> = {
  package: "Package",
  add_on: "Add-on",
  per_unit: "Per-unit",
};

// The quiet borderless field: reads as document text at rest, reveals an
// input affordance on hover, and only fully dresses as a field on focus.
const quietField =
  "h-7 rounded-md border border-transparent bg-transparent px-1.5 text-sm tabular-nums transition-colors duration-100 hover:border-input/60 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/**
 * A number field that doesn't fight the person typing in it.
 *
 * Bound directly to a number, an empty field renders "0", the caret sits
 * after it, and typing a price produced "02233" — right value, wrong
 * looking, and it reads as a typo every time. Here zero renders as empty
 * (with a "0" placeholder, so the field still says what it holds), and
 * any leading zero is dropped as you type.
 *
 * The draft is a string while focused so a half-typed "1." or "0.0"
 * survives; on blur it's dropped and the canonical number is shown
 * again, which is also what lets an external change — applying a
 * document default, inserting a catalog price — reach the field.
 */
function QuietNumberInput({
  value,
  onValueChange,
  className,
  ...rest
}: {
  value: number;
  onValueChange: (value: number) => void;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
>) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === 0 ? "" : String(value));

  return (
    <input
      type="number"
      value={shown}
      placeholder="0"
      onChange={(e) => {
        // "007" -> "7", "-05" -> "-5", but "0" and "0.5" are left alone.
        const cleaned = e.target.value.replace(/^(-?)0+(?=\d)/, "$1");
        setDraft(cleaned);
        onValueChange(Number(cleaned) || 0);
      }}
      onBlur={() => setDraft(null)}
      className={className}
      {...rest}
    />
  );
}

type DisclosureRowProps = {
  item: LineItemInput;
  /** The live catalog package this line was inserted from, if it's a
      package line — null/undefined for an ordinary line. Its price locks
      the row's unit-price field (the package's own price is the only
      figure that counts) and its package_items render as a read-only
      breakdown beneath the row. Resolved live from the catalog by the
      caller (LineItemsEditor), so editing the package later updates what
      renders here without touching this document's saved data. */
  packageInfo?: CatalogItem | null;
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
  packageInfo,
  onChange,
  onRemove,
  onEnter,
  onBackspaceEmpty,
  requestFocus,
  onFocusHandled,
  onSlashInsert,
}: DisclosureRowProps) {
  const [expanded, setExpanded] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const currencyPrefix = getCurrencyPrefix();
  const isPackageLine = !!packageInfo;

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

  // The description is a textarea so long item names wrap instead of
  // scrolling out of sight — construction line items run to a full
  // sentence ("NIPPON PLATONE 8000 818(600) VERMILION 20KG"), and a
  // single-line input hid everything past the field's width.
  //
  // Height is driven from content rather than a fixed `rows`, so the row
  // is exactly as tall as its text: reset to auto first, because
  // scrollHeight can only grow while a height is set. Re-measured on
  // resize too — the same text wraps to a different number of lines when
  // the column width changes.
  useLayoutEffect(() => {
    const el = descRef.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [item.description]);

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

  const showDiscountBadge = discountPct > 0;

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
        <textarea
          ref={descRef}
          rows={1}
          value={item.description}
          onChange={(e) => onChange({ description: e.target.value })}
          onKeyDown={(e) => {
            // Plain Enter only — ⌘/Ctrl+Enter belongs to the builder's
            // global save-and-send shortcut and must pass through.
            //
            // Enter is always swallowed, even on an empty line that has
            // no next row to compose: this is a textarea now, so letting
            // it through would type a literal newline into the item name,
            // which the printed document renders as a space anyway.
            if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              if (item.description.trim() !== "") onEnter?.();
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
          // resize-none + overflow-hidden: the height is ours to control
          // (above), so neither the drag handle nor a scrollbar should
          // appear. break-words catches a single unbroken product code
          // that is wider than the column.
          className="min-w-0 basis-full resize-none overflow-hidden break-words border-none bg-transparent py-1 text-[15px] leading-snug outline-none placeholder:text-muted-foreground/40 md:basis-auto md:flex-1"
        />

        {/* Honesty badges: hidden values that move the total. */}
        {showDiscountBadge && (
          <span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-red-700 dark:bg-red-400/10 dark:text-red-400">
            −{discountPct}%
          </span>
        )}

        {/* flex-wrap for phones: quantity, unit, rate, amount and the two
            row controls are wider than a narrow screen once an amount runs
            to billions, and with justify-end the overflow used to fall off
            the left edge where it couldn't even be scrolled to. Wrapping
            keeps every field reachable; on md the cluster is one line
            again. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-2 gap-y-1 md:flex-none md:flex-nowrap">
          {/* Quantity and Unit travel together — "how much" of what — so
              the eye never has to jump across the row to connect them. */}
          <QuietNumberInput
            value={item.quantity}
            onValueChange={(quantity) => onChange({ quantity })}
            min={0}
            step="0.01"
            className={cn(quietField, "w-14 shrink-0 text-right")}
            aria-label="Quantity"
          />
          <input
            value={item.unit ?? ""}
            onChange={(e) => onChange({ unit: e.target.value })}
            placeholder="unit"
            className={cn(quietField, "w-14 shrink-0 text-left")}
            aria-label="Unit"
          />
          <span className="shrink-0 text-[13px] text-muted-foreground/60">×</span>
          <div className="relative shrink-0">
            {currencyPrefix && (
              <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/60">
                {currencyPrefix}
              </span>
            )}
            <QuietNumberInput
              value={item.unit_price}
              onValueChange={(unit_price) => onChange({ unit_price })}
              min={0}
              step="0.01"
              disabled={isPackageLine}
              title={isPackageLine ? "Package price — set from the catalog" : undefined}
              className={cn(
                quietField,
                "w-32 shrink-0 text-right",
                currencyPrefix && "pl-8",
                isPackageLine && "cursor-not-allowed text-muted-foreground"
              )}
              aria-label="Unit price"
            />
          </div>

          {/* The amount: computed, never an input — and always the
              pre-tax line subtotal. Tax is a document concept; it only
              ever appears in the doc-level control and the totals block
              below, never here. */}
          {/* whitespace-nowrap: at a fixed w-28 a billion-rupiah line
              broke after "Rp", printing the currency on one line and the
              figure on the next. The fixed width is desktop-only — on a
              phone the amount sizes to its content so it can't squeeze
              the quantity and unit fields out of the row. */}
          <span className="shrink-0 whitespace-nowrap text-right text-[15px] font-medium tabular-nums tracking-tight md:w-40">
            {formatCurrency(rollingLineTotal)}
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

      {/* Package breakdown — auto-expanded (not gated behind ⌄) since it's
          read-only, client-relevant information: what's actually inside
          the package price above, not an editing exception. Resolved live
          from the catalog by the parent, so it always reflects the
          package's current contents even if this line was added earlier. */}
      {isPackageLine && packageInfo && (
        <div className="px-2 pb-2 pl-8">
          <PackageBreakdown items={packageInfo.package_items} dense />
        </div>
      )}

      {/* The exception line: discount, tax, category — only when a row
          needs to deviate from the document defaults. Unit lives up in
          the main row beside Quantity; it's a billing fact, not an
          exception. */}
      {expanded && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-2 pb-2.5 pt-0.5 text-[13px] text-muted-foreground duration-150 animate-in fade-in">
          <label className="flex items-center gap-1.5">
            Discount
            <QuietNumberInput
              value={discountPct}
              onValueChange={(discount_percent) => onChange({ discount_percent })}
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
