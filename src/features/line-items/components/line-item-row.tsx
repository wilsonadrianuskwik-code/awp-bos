"use client";

import { Hash, Package, PlusCircle, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, getCurrencyPrefix } from "@/lib/utils/format-currency";
import type { LineItemInput } from "@/features/line-items/validators";
import type { LineItemCategory } from "@/features/line-items/types";

const CATEGORY_ICON: Record<LineItemCategory, typeof Package> = {
  package: Package,
  add_on: PlusCircle,
  per_unit: Hash,
};

const CATEGORY_LABEL: Record<LineItemCategory, string> = {
  package: "Package",
  add_on: "Add-on",
  per_unit: "Per-unit",
};

// Shared with the header row in quotation-builder.tsx / invoice-builder.tsx
// — keep the two in sync so columns stay aligned:
//   type | description | qty | unit | unit price | disc | tax | total | remove
// Description is the primary field and takes all remaining slack (the only
// flexible `1fr` column); every other column is a tight fixed width so the
// description dominates the row on desktop. The row's horizontal gap
// (gap-x-2) must match the header's gap so the columns line up.
export const LINE_ITEM_GRID_COLS =
  "md:grid-cols-[20px_minmax(0,1fr)_52px_48px_84px_48px_48px_88px_28px]";

type LineItemRowProps = {
  item: LineItemInput;
  currency: string;
  onChange: (patch: Partial<LineItemInput>) => void;
  onRemove: () => void;
};

export function LineItemRow({
  item,
  currency,
  onChange,
  onRemove,
}: LineItemRowProps) {
  const Icon = CATEGORY_ICON[item.category];
  const descriptionMissing = !item.description.trim();
  const currencyPrefix = getCurrencyPrefix(currency);

  const itemSubtotal = item.quantity * item.unit_price;
  const discount = itemSubtotal * ((item.discount_percent ?? 0) / 100);
  const lineTotal = itemSubtotal - discount;
  const tax = lineTotal * ((item.tax_percent ?? 0) / 100);
  const total = lineTotal + tax;

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-x-3 gap-y-3 rounded-lg border bg-background p-3 md:grid-cols-none md:items-center md:gap-x-2 md:gap-y-0 md:py-2.5",
        LINE_ITEM_GRID_COLS
      )}
    >
      {/* Type — compact, read-only indicator (the category tab already governs this) */}
      <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground md:col-span-1 md:justify-center">
        <Icon className="h-4 w-4 shrink-0" />
        <FieldLabel className="md:hidden">{CATEGORY_LABEL[item.category]}</FieldLabel>
      </div>

      {/* Description — the primary field, takes the most width */}
      <div className="col-span-2 space-y-1 md:col-span-1 md:space-y-0">
        <FieldLabel className="md:hidden">Description</FieldLabel>
        <Input
          value={item.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="What are you charging for?"
          className={cn(
            "h-8",
            descriptionMissing &&
              "border-destructive/50 focus-visible:ring-destructive/50"
          )}
        />
      </div>

      {/* Quantity */}
      <div className="space-y-1 md:space-y-0">
        <FieldLabel className="md:hidden">Qty</FieldLabel>
        <Input
          type="number"
          value={item.quantity}
          onChange={(e) => onChange({ quantity: Number(e.target.value) || 0 })}
          className="h-8 px-1.5 text-center"
          min={0}
          step="0.01"
        />
      </div>

      {/* Unit */}
      <div className="space-y-1 md:space-y-0">
        <FieldLabel className="md:hidden">Unit</FieldLabel>
        <Input
          value={item.unit ?? ""}
          onChange={(e) => onChange({ unit: e.target.value })}
          placeholder="hr, pc..."
          className="h-8 px-1.5"
        />
      </div>

      {/* Unit Price */}
      <div className="col-span-2 space-y-1 md:col-span-1 md:space-y-0">
        <FieldLabel className="md:hidden">Unit Price</FieldLabel>
        <div className="relative">
          {currencyPrefix && (
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {currencyPrefix}
            </span>
          )}
          <Input
            type="number"
            value={item.unit_price}
            onChange={(e) =>
              onChange({ unit_price: Number(e.target.value) || 0 })
            }
            className={cn("h-8 px-1.5", currencyPrefix && "pl-7")}
            min={0}
            step="0.01"
          />
        </div>
      </div>

      {/* Discount */}
      <div className="space-y-1 md:space-y-0">
        <FieldLabel className="md:hidden">Discount %</FieldLabel>
        <Input
          type="number"
          value={item.discount_percent ?? 0}
          onChange={(e) =>
            onChange({ discount_percent: Number(e.target.value) || 0 })
          }
          className="h-8 px-1.5"
          min={0}
          max={100}
        />
      </div>

      {/* Tax */}
      <div className="space-y-1 md:space-y-0">
        <FieldLabel className="md:hidden">Tax %</FieldLabel>
        <Input
          type="number"
          value={item.tax_percent ?? 0}
          onChange={(e) => onChange({ tax_percent: Number(e.target.value) || 0 })}
          className="h-8 px-1.5"
          min={0}
          max={100}
        />
      </div>

      {/* Total — the most visually prominent value in the row. Paired with
          the remove button on mobile so neither sits alone in the stack. */}
      <div className="col-span-2 flex items-center justify-between border-t pt-2 md:col-span-1 md:justify-end md:border-t-0 md:pt-0">
        <FieldLabel className="md:hidden">Total</FieldLabel>
        <span className="font-bold tabular-nums tracking-tight md:text-right md:text-sm">
          {formatCurrency(total, currency)}
        </span>
      </div>

      <div className="col-span-2 flex justify-end md:col-span-1 md:justify-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function FieldLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "block text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}
