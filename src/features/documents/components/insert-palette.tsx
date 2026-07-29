"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CornerDownLeft, FileDown, Package, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils/format-currency";
import { cn } from "@/lib/utils/cn";
import type { CatalogItem } from "@/features/catalog/types";
import type { TemplateWithItems } from "@/features/line-items/types";
import type { LineItemInput } from "@/features/line-items/validators";

const RECENTS_KEY = "builder.recent-inserts";
const RECENTS_MAX = 5;

function readRecents(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  try {
    const next = [id, ...readRecents().filter((r) => r !== id)].slice(
      0,
      RECENTS_MAX
    );
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // Recents are a convenience — never let storage failures surface.
  }
}

// Same field mapping the catalog picker dialog has always used. A package
// inserts at its package_price (not the sum of its items) with quantity 1 —
// the breakdown itself is resolved live from catalog_item_id at render
// time (DisclosureRow), not stored here. `unitPrice` is pre-resolved by
// the caller (default, or this client's override — see priceFor below).
function catalogToLineItem(item: CatalogItem, unitPrice: number): LineItemInput {
  return {
    category: item.is_package ? "package" : item.default_category,
    description: item.description
      ? `${item.name} — ${item.description}`
      : item.name,
    quantity: 1,
    unit_price: unitPrice,
    unit: item.default_unit ?? "",
    discount_percent: 0,
    tax_percent: 0,
    catalog_item_id: item.id,
  };
}

// Same field mapping the template picker dialog has always used.
function templateToLineItems(t: TemplateWithItems): LineItemInput[] {
  return t.items.map((i) => ({
    category: i.category,
    description: i.description,
    quantity: i.quantity,
    unit_price: i.unit_price,
    unit: i.unit ?? "",
    discount_percent: i.discount_percent ?? 0,
    tax_percent: i.tax_percent ?? 0,
  }));
}

type PaletteRow =
  | { kind: "catalog"; key: string; item: CatalogItem; recent: boolean }
  | { kind: "template"; key: string; template: TemplateWithItems };

type InsertPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogItems: CatalogItem[];
  templates: TemplateWithItems[];
  documentCurrency: string;
  /** Resolves the price to insert/display for a catalog item — the
   *  default price, or this document's client's override if one exists.
   *  Falls back to the item's own default price when omitted. */
  priceFor?: (item: CatalogItem) => number;
  /** Insert one catalog line (already mapped). Palette stays open. */
  onInsertCatalog: (item: LineItemInput) => void;
  /** Insert a template bundle (already mapped). Palette stays open. */
  onInsertTemplate: (items: LineItemInput[]) => void;
};

function defaultPriceFor(item: CatalogItem): number {
  return item.is_package ? (item.package_price ?? 0) : item.default_unit_price;
}

// The unified insert surface: one search over the catalog AND saved
// templates, ranked Recent → Catalog → Templates (re-inserting a known
// item is the most common act). Currency-mismatched items stay visible
// but disabled with the reason inline — honesty over tidiness. Enter
// inserts and keeps the palette open for rapid multi-insert.
export function InsertPalette({
  open,
  onOpenChange,
  catalogItems,
  templates,
  documentCurrency,
  priceFor = defaultPriceFor,
  onInsertCatalog,
  onInsertTemplate,
}: InsertPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setFlashKey(null);
      setRecents(readRecents());
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setActiveIndex(0), [query]);

  const rows = useMemo<PaletteRow[]>(() => {
    const q = query.trim().toLowerCase();
    const matchCatalog = (i: CatalogItem) =>
      !q ||
      i.name.toLowerCase().includes(q) ||
      (i.sku ?? "").toLowerCase().includes(q);
    const matchTemplate = (t: TemplateWithItems) =>
      !q || t.name.toLowerCase().includes(q);

    const recentSet = new Set(recents);
    const recentRows = recents
      .map((id) => catalogItems.find((i) => i.id === id))
      .filter((i): i is CatalogItem => !!i && matchCatalog(i))
      .map<PaletteRow>((item) => ({
        kind: "catalog",
        key: `r-${item.id}`,
        item,
        recent: true,
      }));
    const catalogRows = catalogItems
      .filter((i) => !recentSet.has(i.id) && matchCatalog(i))
      .map<PaletteRow>((item) => ({
        kind: "catalog",
        key: `c-${item.id}`,
        item,
        recent: false,
      }));
    const templateRows = templates
      .filter(matchTemplate)
      .map<PaletteRow>((template) => ({
        kind: "template",
        key: `t-${template.id}`,
        template,
      }));
    return [...recentRows, ...catalogRows, ...templateRows];
  }, [query, recents, catalogItems, templates]);

  function isDisabled(row: PaletteRow): boolean {
    return row.kind === "catalog" && row.item.currency !== documentCurrency;
  }

  const enabledIndexes = rows
    .map((row, i) => (isDisabled(row) ? -1 : i))
    .filter((i) => i >= 0);

  function step(dir: 1 | -1) {
    if (enabledIndexes.length === 0) return;
    const pos = enabledIndexes.indexOf(activeIndex);
    const nextPos =
      pos < 0
        ? 0
        : Math.min(Math.max(pos + dir, 0), enabledIndexes.length - 1);
    setActiveIndex(enabledIndexes[nextPos]);
    document
      .getElementById(`insert-row-${enabledIndexes[nextPos]}`)
      ?.scrollIntoView({ block: "nearest" });
  }

  function insertRow(row: PaletteRow) {
    if (isDisabled(row)) return;
    if (row.kind === "catalog") {
      onInsertCatalog(catalogToLineItem(row.item, priceFor(row.item)));
      pushRecent(row.item.id);
    } else {
      onInsertTemplate(templateToLineItems(row.template));
    }
    // Inserted-✓ flash, then the palette stays open for the next insert.
    setFlashKey(row.key);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashKey(null), 900);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "Enter" && rows[activeIndex]) {
      e.preventDefault();
      insertRow(rows[activeIndex]);
    }
  }

  // Section label appears above the first row of each group.
  function sectionFor(index: number): string | null {
    const row = rows[index];
    const prev = rows[index - 1];
    const label =
      row.kind === "template"
        ? "Templates"
        : row.recent
          ? "Recent"
          : "Catalog";
    const prevLabel = prev
      ? prev.kind === "template"
        ? "Templates"
        : prev.recent
          ? "Recent"
          : "Catalog"
      : null;
    return label !== prevLabel ? label : null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[18%] max-w-xl translate-y-0 gap-0 p-0 [&>button]:hidden">
        <DialogTitle className="sr-only">Insert items</DialogTitle>
        <div className="flex items-center gap-2.5 border-b px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search catalog and templates…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:block">
            ESC
          </kbd>
        </div>
        <div className="max-h-[340px] overflow-y-auto p-1.5">
          {rows.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">
              {query
                ? `No matches for “${query}”`
                : "Nothing in your catalog or templates yet."}
            </p>
          ) : (
            rows.map((row, index) => {
              const disabled = isDisabled(row);
              const section = sectionFor(index);
              return (
                <div key={row.key}>
                  {section && (
                    <p className="px-2.5 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 first:pt-1.5">
                      {section}
                    </p>
                  )}
                  <button
                    id={`insert-row-${index}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => insertRow(row)}
                    onMouseEnter={() => !disabled && setActiveIndex(index)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors duration-100",
                      disabled
                        ? "cursor-not-allowed opacity-50"
                        : index === activeIndex
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground/80"
                    )}
                  >
                    {row.kind === "catalog" ? (
                      <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <FileDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {row.kind === "catalog" ? row.item.name : row.template.name}
                      {row.kind === "catalog" && row.item.is_package && (
                        <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Paket
                        </span>
                      )}
                      {row.kind === "template" && (
                        <span className="ml-1.5 text-muted-foreground">
                          · {row.template.items.length} item
                          {row.template.items.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </span>
                    {row.kind === "catalog" && (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {disabled
                          ? `${row.item.currency} — this document is ${documentCurrency}`
                          : formatCurrency(priceFor(row.item), row.item.currency)}
                      </span>
                    )}
                    {flashKey === row.key ? (
                      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600 duration-150 animate-in fade-in dark:text-emerald-400">
                        <Check className="h-3.5 w-3.5" />
                        Inserted
                      </span>
                    ) : (
                      index === activeIndex &&
                      !disabled && (
                        <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
