"use client";

import { FileDown, FileUp, Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  LineItemRow,
  LINE_ITEM_GRID_COLS,
} from "@/features/line-items/components/line-item-row";
import { cn } from "@/lib/utils/cn";
import type { LineItemInput } from "@/features/line-items/validators";
import type { LineItemCategory } from "@/features/line-items/types";

const CATEGORY_LABEL: Record<LineItemCategory, string> = {
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
};

// The hero of the document editor: every category visible at once as
// stacked labeled groups — a ledger you read top-to-bottom, not tabs
// that hide two-thirds of the document. Groups with items get the full
// column-header + rows treatment; empty groups collapse to one slim
// dashed add-target so they suggest rather than shout. Pure
// presentation: all mutation handlers are injected by the builder.
export function LineItemsEditor({
  itemsByCategory,
  currency,
  onAdd,
  onUpdate,
  onRemove,
  onOpenCatalog,
  onOpenTemplate,
  onOpenSaveTemplate,
}: LineItemsEditorProps) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Line Items
        </h2>
        {/* Quiet ghost toolbar: insertion sources + save-as-template,
            present without competing with the ledger itself. */}
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

      <div className="mt-4 space-y-8">
        {CATEGORY_ORDER.map((cat) => {
          const rows = itemsByCategory[cat];
          const singular = CATEGORY_LABEL[cat].toLowerCase().replace(/s$/, "");

          if (rows.length === 0) {
            // Empty group: one slim inline target — enough to invite,
            // not enough to clutter a document that doesn't use it.
            return (
              <button
                key={cat}
                type="button"
                onClick={() => onAdd(cat)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-3.5 text-[13px] text-muted-foreground/70 transition-colors duration-150 hover:border-primary/40 hover:bg-primary/[0.02] hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Add {singular}
              </button>
            );
          }

          return (
            <div key={cat}>
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="text-sm font-semibold">{CATEGORY_LABEL[cat]}</h3>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {rows.length}
                </span>
              </div>
              <div
                className={cn(
                  "hidden gap-x-2 px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid",
                  LINE_ITEM_GRID_COLS
                )}
              >
                <span />
                <span>Description</span>
                <span>Qty</span>
                <span>Unit</span>
                <span>Unit Price</span>
                <span>Disc %</span>
                <span>Tax %</span>
                <span className="text-right">Total</span>
                <span />
              </div>
              <div className="space-y-2">
                {rows.map(({ item, originalIndex }) => (
                  <LineItemRow
                    key={originalIndex}
                    item={item}
                    currency={currency}
                    onChange={(patch) => onUpdate(originalIndex, patch)}
                    onRemove={() => onRemove(originalIndex)}
                  />
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => onAdd(cat)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add {singular}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
