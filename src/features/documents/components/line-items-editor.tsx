"use client";

import { useState } from "react";
import { FileDown, FileUp, MoreHorizontal, Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DisclosureRow } from "@/features/documents/components/disclosure-row";
import { cn } from "@/lib/utils/cn";
import type { LineItemInput } from "@/features/line-items/validators";
import type { LineItemCategory } from "@/features/line-items/types";
import type { CatalogItem } from "@/features/catalog/types";

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
  /** Catalog items by id, so a package line (via item.catalog_item_id) can
      show its live breakdown. Omit if the caller has no catalog context. */
  catalogItemsById?: Record<string, CatalogItem>;
  onAdd: (category: LineItemCategory) => void;
  onUpdate: (index: number, patch: Partial<LineItemInput>) => void;
  onRemove: (index: number) => void;
  onOpenCatalog?: () => void;
  onOpenTemplate?: () => void;
  onOpenSaveTemplate: () => void;
  /** Unified ⌘K insert palette — when provided, replaces the separate
      Catalog/Template buttons and claims ⌘K while focus is in the items
      zone. */
  onOpenInsertPalette?: () => void;
  /** Enter-to-compose: commit row `index`, insert the next line after it. */
  onComposeAfter?: (index: number) => void;
  /** Backspace on an empty row: delete it, caret to the previous line. */
  onDeleteEmpty?: (index: number) => void;
  /** Which row (by original index) should take the caret, if any. */
  focusIndex?: number | null;
  onFocusHandled?: () => void;
  /** Document-level defaults — null means the lines are mixed. */
  docDiscount?: number | null;
  /** Document-level unit — null when the lines use different units. */
  docUnit?: string | null;
  /** Apply new document defaults (parent decides following vs. pinned). */
  onApplyDefaults?: (tax: number, discount: number, unit: string) => void;
};

// The document-defaults control: quiet text on the Items header that
// opens a small popover. Setting tax once here is what kills the
// type-11%-into-every-row ERP chore; per-line overrides stay possible
// via row expand and keep their honesty badge.
function DocDefaultsControl({
  docDiscount,
  docUnit,
  onApply,
}: {
  docDiscount: number | null;
  docUnit: string | null;
  onApply: (tax: number, discount: number, unit: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [unitInput, setUnitInput] = useState("");

  function handleOpenChange(next: boolean) {
    if (next) {
      setDiscountInput(docDiscount === null ? "" : String(docDiscount));
      setUnitInput(docUnit === null ? "" : docUnit);
    }
    setOpen(next);
  }

  function apply() {
    // Tax is no longer a line-level concept: PPN is set once on the
    // document's totals block (see TaxBreakdownEditor), so every line is
    // written tax-free and the breakdown is the only place a rate lives.
    onApply(0, Number(discountInput) || 0, unitInput.trim());
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
          Discount {docDiscount === null ? "· mixed" : `${docDiscount}%`}
          <span className="mx-1.5 text-muted-foreground/40">·</span>
          Unit {docUnit === null ? "· mixed" : docUnit || "—"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Document defaults
        </p>
        <div className="mt-3 space-y-2.5">
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
          {/* Construction documents usually price every line in the same
              unit (m2, kg, sak), so setting it once here beats typing it
              on each row. Unlike tax/discount this applies to every line
              unconditionally — there's no "following vs pinned" notion
              for a unit. */}
          <label className="flex items-center justify-between gap-3 text-sm">
            Unit
            <span className="flex items-center gap-1.5">
              <input
                type="text"
                maxLength={50}
                value={unitInput}
                onChange={(e) => setUnitInput(e.target.value)}
                placeholder={docUnit === null ? "mixed" : "e.g. m2"}
                className={fieldClass.replace("w-16", "w-24").replace("text-right", "text-left")}
              />
            </span>
          </label>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {docDiscount === null
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
  catalogItemsById,
  onAdd,
  onUpdate,
  onRemove,
  onOpenCatalog,
  onOpenTemplate,
  onOpenSaveTemplate,
  onOpenInsertPalette,
  onComposeAfter,
  onDeleteEmpty,
  focusIndex,
  onFocusHandled,
  docDiscount,
  docUnit,
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
    <div
      onKeyDown={
        onOpenInsertPalette
          ? (e) => {
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                e.stopPropagation();
                onOpenInsertPalette();
              }
            }
          : undefined
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Items{totalCount > 0 && <span className="ml-1.5 normal-case tracking-normal">· {totalCount}</span>}
        </h2>
        <div className="flex items-center gap-1">
          {onApplyDefaults && (
            <DocDefaultsControl
              docDiscount={docDiscount === undefined ? 0 : docDiscount}
              docUnit={docUnit === undefined ? "" : docUnit}
              onApply={onApplyDefaults}
            />
          )}
          {onOpenInsertPalette ? (
            <>
              {/* Palette mode: one Insert affordance; Save-as-Template is
                  an export verb, exiled to the ⋯ menu out of the compose
                  flow. */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-muted-foreground hover:text-foreground"
                onClick={onOpenInsertPalette}
              >
                <Package className="mr-1.5 h-3.5 w-3.5" />
                Insert
                <kbd className="ml-1.5 rounded border bg-muted px-1 text-[10px] font-medium">
                  ⌘K
                </kbd>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    aria-label="More item actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onOpenSaveTemplate}>
                    <FileUp className="mr-2 h-4 w-4" />
                    Save items as Template
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
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
            </>
          )}
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
          Add your first item — type a description, or press ⌘K to pull from your catalog
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
                {itemsByCategory[cat].map(({ item, originalIndex }) => {
                  const catalogItem = item.catalog_item_id
                    ? catalogItemsById?.[item.catalog_item_id]
                    : undefined;
                  return (
                    <DisclosureRow
                      key={originalIndex}
                      item={item}
                      packageInfo={catalogItem?.is_package ? catalogItem : null}
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
                      onSlashInsert={onOpenInsertPalette}
                    />
                  );
                })}
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
            {onOpenInsertPalette && (
              <span className="ml-auto text-[11px] text-muted-foreground/50">
                ⌘K catalog / template
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
