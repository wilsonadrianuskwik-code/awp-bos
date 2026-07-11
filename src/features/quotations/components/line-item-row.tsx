"use client";

import { Hash, Minus, Package, Plus, PlusCircle, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { LineItemInput } from "@/features/quotations/validators";
import type { LineItemCategory } from "@/features/quotations/types";

const CATEGORY_ICON: Record<LineItemCategory, typeof Package> = {
  package: Package,
  add_on: PlusCircle,
  per_unit: Hash,
};

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
    <div className="group flex flex-col gap-2 rounded-lg border bg-background p-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Icon className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />

      <Input
        value={item.description}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="Description"
        className="h-8 flex-1 sm:min-w-[10rem]"
      />

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
          className="h-8 w-14 text-center"
          min={0}
          step="0.01"
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

      <Input
        type="number"
        value={item.unit_price}
        onChange={(e) => onChange({ unit_price: Number(e.target.value) || 0 })}
        placeholder="Unit price"
        className="h-8 w-24"
        min={0}
        step="0.01"
      />

      <Input
        value={item.unit ?? ""}
        onChange={(e) => onChange({ unit: e.target.value })}
        placeholder="unit"
        className="h-8 w-16"
      />

      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={item.discount_percent ?? 0}
          onChange={(e) =>
            onChange({ discount_percent: Number(e.target.value) || 0 })
          }
          placeholder="Disc %"
          className="h-8 w-16"
          min={0}
          max={100}
        />
        <Input
          type="number"
          value={item.tax_percent ?? 0}
          onChange={(e) =>
            onChange({ tax_percent: Number(e.target.value) || 0 })
          }
          placeholder="Tax %"
          className="h-8 w-16"
          min={0}
          max={100}
        />
      </div>

      <span className="ml-auto w-24 shrink-0 text-right text-sm font-medium tabular-nums">
        {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
          total
        )}
      </span>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
