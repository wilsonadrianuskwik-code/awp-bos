"use client";

import { FileDown, FileUp, Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DisclosureRow } from "@/features/documents/components/disclosure-row";
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
  /** Document-level tax default — rows matching it carry no badge. */
  docTaxDefault?: number;
  onAdd: (category: LineItemCategory) => void;
  onUpdate: (index: number, patch: Partial<LineItemInput>) => void;
  onRemove: (index: number) => void;
  onOpenCatalog: () => void;
  onOpenTemplate: () => void;
  onOpenSaveTemplate: () => void;
};

// The hero of the document editor: a ledger of DisclosureRows read
// top-to-bottom. Grouping is automatic, never imposed — an invoice whose
// items share one category renders as a flat list with no headers; only
// a genuinely mixed document gets quiet eyebrow group markers. One add
// affordance (continuing the last-used category) instead of three
// per-category buttons.
export function LineItemsEditor({
  itemsByCategory,
  currency,
  docTaxDefault = 0,
  onAdd,
  onUpdate,
  onRemove,
  onOpenCatalog,
  onOpenTemplate,
  onOpenSaveTemplate,
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
        <div className="flex gap-1">
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
                    docTaxDefault={docTaxDefault}
                    onChange={(patch) => onUpdate(originalIndex, patch)}
                    onRemove={() => onRemove(originalIndex)}
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
