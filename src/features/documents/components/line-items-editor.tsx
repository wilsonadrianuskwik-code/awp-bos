"use client";

import { useState } from "react";
import { FileDown, FileUp, Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DisclosureRow } from "@/features/documents/components/disclosure-row";
import { cn } from "@/lib/utils/cn";
import type { LineItemInput } from "@/features/line-items/validators";
import type { LineItemCategory } from "@/features/line-items/types";

const GROUP_LABEL: Record<LineItemCategory, string> = {
  package: "Packages",
  add_on: "Add-ons",
  per_unit: "Per-unit",
};

const CATEGORY_ORDER: LineItemCategory[] = ["package", "add_on", "per_unit"];

type LineItemsEditorProps = {
  itemsByCategory: Record<
    LineItemCategory,
    { item: LineItemInput; originalIndex: number }[]
  >;
  currency: string;
  onAdd: (category: LineItemCategory) => void;
  onUpdate: (index: number, patch: Partial<LineItemInput>) => void;
  onRemove: (index: number) => void;
  onOpenCatalog: () => void;
  onOpenTemplate: () => void;
  onOpenSaveTemplate: () => void;
  /** Enter-to-compose: commit row `index`, insert the next line after it. */
  onComposeAfter?: (index: number) => void;
  /** Backspace on an empty row: delete it, caret to the previous line. */
  onDeleteEmpty?: (index: number) => void;
  /** Which row (by original index) should take the caret, if any. */
  focusIndex?: number | null;
  onFocusHandled?: () => void;
  /** Document-level defaults — null means the lines are mixed. */
  docTax?: number | null;
  docDiscount?: number | null;
  /** Apply new document defaults (parent decides following vs. pinned). */
  onApplyDefaults?: (tax: number, discount: number) => void;
};

// The document-defaults control: quiet text on the Items header that
// opens a small popover. Setting tax once here is what kills the
// type-11%-into-every-row ERP chore; per-line overrides stay possible
// via row expand and keep their honesty badge.
function DocDefaultsControl({
  docTax,
  docDiscount,
  onApply,
}: {
  docTax: number | null;
  docDiscount: number | null;
  onApply: (tax: number, discount: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [taxInput, setTaxInput] = useState("");
  const [discountInput, setDiscountInput] = useState("");

  function handleOpenChange(next: boolean) {
    if (next) {
      setTaxInput(docTax === null ? "" : String(docTax));
      setDiscountInput(docDiscount === null ? "" : String(docDiscount));
    }
    setOpen(next);
  }

  function apply() {
    onApply(Number(taxInput) || 0, Number(discountInput) || 0);
    setOpen(false);
  }

  const fieldClass =
    "h-8 w-16 rounded-md border border-input bg-card px-2 text-right text-sm tabular-nums focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-[13px] tabular-nums text-muted-foreground transition-colors duration-100 hover:bg-muted/60 hover:text-foreground"
        >
          Tax {docTax === null ? "· mixed" : `${docTax}%`}
          <span className="mx-1.5 text-muted-foreground/40">·</span>
          Discount {docDiscount === null ? "· mixed" : `${docDiscount}%`}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Document defaults
        </p>
        <div className="mt-3 space-y-2.5">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              Tax
              <button
                type="button"
                onClick={() => setTaxInput("11")}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors duration-100",
                  taxInput === "11"
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                PPN 11%
              </button>
            </span>
            <span className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={100}
                value={taxInput}
                onChange={(e) => setTaxInput(e.target.value)}
                placeholder={docTax === null ? "mixed" : "0"}
                className={fieldClass}
              />
              %
            </span>
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            Discount
            <span className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={100}
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                placeholder={docDiscount === null ? "mixed" : "0"}
                className={fieldClass}
              />
              %
            </span>
          </label>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {docTax === null || docDiscount === null
            ? "Lines currently differ — applying sets every line to these values."
            : "Applies to lines following the document default; lines you've overridden keep their value."}
        </p>
        <Button type="button" size="sm" className="mt-3 w-full" onClick={apply}>
          Apply to document
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// The hero of the document editor: a ledger of DisclosureRows read
// top-to-bottom. Grouping is automatic, never imposed — an invoice whose
// items share one category renders as a flat list with no headers; only
// a genuinely mixed document gets quiet eyebrow group markers. One add
// affordance (continuing the last-used category) instead of three
// per-category buttons.
export function LineItemsEditor({
  itemsByCategory,
  currency,
  onAdd,
  onUpdate,
  onRemove,
  onOpenCatalog,
  onOpenTemplate,
  onOpenSaveTemplate,
  onComposeAfter,
  onDeleteEmpty,
  focusIndex,
  onFocusHandled,
  docTax,
  docDiscount,
  onApplyDefaults,
}: LineItemsEditorProps) {
  const nonEmpty = CATEGORY_ORDER.filter(
    (cat) => itemsByCategory[cat].length > 0
  );
  const totalCount = nonEmpty.reduce(
    (n, cat) => n + itemsByCategory[cat].length,
    0
  );
  const isMixed = nonEmpty.length > 1;

  // "Add item" continues whatever the user was last doing: the category
  // of the newest row (highest original index), or per-unit on a blank
  // document.
  const lastCategory: LineItemCategory =
    CATEGORY_ORDER.flatMap((cat) => itemsByCategory[cat]).reduce(
      (latest, row) =>
        row.originalIndex > latest.index
          ? { index: row.originalIndex, cat: row.item.category }
          : latest,
      { index: -1, cat: "per_unit" as LineItemCategory }
    ).cat;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Items{totalCount > 0 && <span className="ml-1.5 normal-case tracking-normal">· {totalCount}</span>}
        </h2>
        <div className="flex items-center gap-1">
          {onApplyDefaults && (
            <DocDefaultsControl
              docTax={docTax === undefined ? 0 : docTax}
              docDiscount={docDiscount === undefined ? 0 : docDiscount}
              onApply={onApplyDefaults}
            />
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-muted-foreground hover:text-foreground"
            onClick={onOpenCatalog}
          >
            <Package className="mr-1.5 h-3.5 w-3.5" />
            Catalog
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-muted-foreground hover:text-foreground"
            onClick={onOpenTemplate}
          >
            <FileDown className="mr-1.5 h-3.5 w-3.5" />
            Template
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-muted-foreground hover:text-foreground"
            onClick={onOpenSaveTemplate}
          >
            <FileUp className="mr-1.5 h-3.5 w-3.5" />
            Save as Template
          </Button>
        </div>
      </div>

      {totalCount === 0 ? (
        // The empty state teaches the path — one caret-ready line, not a
        // dead placeholder box.
        <button
          type="button"
          onClick={() => onAdd(lastCategory)}
          className="mt-4 flex w-full items-center gap-2 rounded-md px-2 py-3 text-left text-[15px] text-muted-foreground/60 transition-colors duration-150 hover:bg-muted/40 hover:text-muted-foreground"
        >
          <Plus className="h-4 w-4 shrink-0" />
          Add your first item — type a description, or pull from your catalog
        </button>
      ) : (
        <div className="mt-3">
          {nonEmpty.map((cat) => (
            <div key={cat} className={isMixed ? "mb-6 last:mb-0" : undefined}>
              {isMixed && (
                <h3 className="mb-1.5 mt-4 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 first:mt-0">
                  {GROUP_LABEL[cat]}
                </h3>
              )}
              <div className="space-y-0.5">
                {itemsByCategory[cat].map(({ item, originalIndex }) => (
                  <DisclosureRow
                    key={originalIndex}
                    item={item}
                    currency={currency}
                    docTaxDefault={docTax ?? 0}
                    onChange={(patch) => onUpdate(originalIndex, patch)}
                    onRemove={() => onRemove(originalIndex)}
                    onEnter={
                      onComposeAfter
                        ? () => onComposeAfter(originalIndex)
                        : undefined
                    }
                    onBackspaceEmpty={
                      onDeleteEmpty
                        ? () => onDeleteEmpty(originalIndex)
                        : undefined
                    }
                    requestFocus={focusIndex === originalIndex}
                    onFocusHandled={onFocusHandled}
                  />
                ))}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => onAdd(lastCategory)}
            className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] text-muted-foreground/70 transition-colors duration-150 hover:bg-muted/40 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            Add item
          </button>
        </div>
      )}
    </div>
  );
}
