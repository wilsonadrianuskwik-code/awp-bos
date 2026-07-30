"use client";

import { type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Package, Wrench } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useWorkspace } from "@/providers/workspace-provider";
import { CatalogRowActions } from "@/features/catalog/components/catalog-row-actions";
import { CatalogStatusToggle } from "@/features/catalog/components/catalog-status-toggle";
import { formatCurrency } from "@/lib/utils/format-currency";
import { cn } from "@/lib/utils/cn";
import type { CatalogItem } from "@/features/catalog/types";
import type { LineItemCategory } from "@/features/line-items/types";

const CATEGORY_LABEL: Record<LineItemCategory, string> = {
  package: "Package",
  add_on: "Add-on",
  per_unit: "Per-unit",
};

type CatalogGridProps = {
  items: CatalogItem[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
};

// Visual browsing surface for the catalog — the table is the daily-driver
// for bulk work, this is for scanning a product line at a glance (the
// role Odoo/ERPNext's Kanban-style item grid plays, without a status
// pipeline to drag between since catalog items don't have one).
export function CatalogGrid({ items, selectedIds, onSelectedIdsChange }: CatalogGridProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => {
        const href = `/${workspace.slug}/catalog/${item.id}`;
        const Icon = item.item_type === "product" ? Package : Wrench;
        const isSelected = selectedIds.has(item.id);

        return (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            className={cn(
              "group relative flex cursor-pointer flex-col rounded-lg border bg-card p-4 shadow-2xs outline-none transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/30",
              isSelected && "border-primary/40 bg-primary/5"
            )}
            onClick={() => router.push(href)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter") router.push(href);
            }}
          >
            <div
              className="absolute left-3 top-3 z-10"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggleSelect(item.id)}
                aria-label="Select item"
                className="bg-card opacity-0 shadow-2xs transition-opacity group-hover:opacity-100 data-[state=checked]:opacity-100"
              />
            </div>

            <div className="flex items-start justify-between gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                <CatalogRowActions item={item} />
              </div>
            </div>

            <div className="mt-3 min-w-0">
              <h3 className="flex items-center gap-1.5 truncate text-sm font-semibold">
                {item.name}
                {item.is_package && (
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Paket
                  </span>
                )}
              </h3>
              {item.sku && (
                <p className="truncate font-mono text-xs text-muted-foreground">{item.sku}</p>
              )}
            </div>

            <div className="mt-3 flex items-end justify-between">
              <div>
                <span className="text-lg font-semibold tabular-nums tracking-tight">
                  {formatCurrency(item.is_package ? (item.package_price ?? 0) : item.default_unit_price)}
                </span>
                {item.default_unit && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    / {item.default_unit}
                  </span>
                )}
              </div>
              <CatalogStatusToggle item={item} />
            </div>

            <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
              <span>
                {item.is_package
                  ? `${item.package_items.length} item${item.package_items.length === 1 ? "" : "s"}`
                  : CATEGORY_LABEL[item.default_category]}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
