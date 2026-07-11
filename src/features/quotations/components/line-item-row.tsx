"use client";

import { Hash, Minus, Package, Plus, PlusCircle, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, getCurrencyPrefix } from "@/lib/utils/format-currency";
import type { LineItemInput } from "@/features/quotations/validators";
import type { LineItemCategory } from "@/features/quotations/types";

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

// Shared with the header row in quotation-builder.tsx — keep the two in
// sync so columns stay aligned: type | description | qty | unit |
// unit price | discount | tax | total | remove.
export const LINE_ITEM_GRID_COLS =
  "md:grid-cols-[28px_minmax(0,1fr)_72px_84px_112px_84px_84px_128px_32px]";

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

  function step(delta: number) {
    const next = Math.max(0, Math.round((item.quantity + delta) * 1000) / 1000);
    onChange({ quantity: next });
  }

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-x-3 gap-y-3 rounded-lg border bg-background p-3 md:grid-cols-none md:items-center md:gap-y-0 md:py-2.5",
        LINE_ITEM_GRID_COLS
      )}
    >
      {/* Type — compact, read-only indicator (the category tab already governs this) */}
      <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground md:col-span-1 md:justify-center">
        <Icon className="h-4 w-4 shrink-0" />
        <FieldLabel className="md:hidden">{CATEGORY_LABEL[item.category]}</FieldLabel>
      </div>

      {/* Description — takes the most width */}
      <div className="col-span-2 space-y-1 md:col-span-1">
        <FieldLabel>Description</FieldLabel>
        <Input
          value={item.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="What are you charging for?"
          className={cn(
            descriptionMissing &&
              "border-destructive/50 focus-visible:ring-destructive/50"
          )}
        />
      </div>

      {/* Quantity + Unit travel together */}
      <div className="space-y-1">
        <FieldLabel>Qty</FieldLabel>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => step(-1)}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Input
            type="number"
            value={item.quantity}
            onChange={(e) => onChange({ quantity: Number(e.target.value) || 0 })}
            className="h-8 px-1 text-center"
            min={0}
            step="0.01"
          />
        </div>
      </div>

      <div className="space-y-1">
        <FieldLabel>Unit</FieldLabel>
        <div className="flex items-center gap-1">
          <Input
            value={item.unit ?? ""}
            onChange={(e) => onChange({ unit: e.target.value })}
            placeholder="hr, pc..."
            className="h-8"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => step(1)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Unit Price — its own full-width row on mobile, visually separated
          from Total via the divider on desktop */}
      <div className="col-span-2 space-y-1 md:col-span-1 md:border-l md:pl-3">
        <FieldLabel>Unit Price</FieldLabel>
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
            className={cn("h-8", currencyPrefix && "pl-8")}
            min={0}
            step="0.01"
          />
        </div>
      </div>

      {/* Discount + Tax — paired together, their own cluster separated from Unit Price */}
      <div className="space-y-1 md:border-l md:pl-3">
        <FieldLabel>Discount %</FieldLabel>
        <Input
          type="number"
          value={item.discount_percent ?? 0}
          onChange={(e) =>
            onChange({ discount_percent: Number(e.target.value) || 0 })
          }
          className="h-8"
          min={0}
          max={100}
        />
      </div>
      <div className="space-y-1">
        <FieldLabel>Tax %</FieldLabel>
        <Input
          type="number"
          value={item.tax_percent ?? 0}
          onChange={(e) => onChange({ tax_percent: Number(e.target.value) || 0 })}
          className="h-8"
          min={0}
          max={100}
        />
      </div>

      {/* Total — the most visually prominent value in the row. Paired with
          the remove button on mobile so neither sits alone in the stack. */}
      <div className="col-span-2 flex items-center justify-between border-t pt-2 md:col-span-1 md:justify-end md:border-l md:border-t-0 md:pl-3 md:pt-0">
        <FieldLabel className="md:hidden">Total</FieldLabel>
        <span className="text-lg font-bold tabular-nums tracking-tight md:text-right">
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
