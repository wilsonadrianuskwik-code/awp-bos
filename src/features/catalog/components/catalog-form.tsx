"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Package, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FormSection,
  FormGrid,
  FieldGroup,
  FormActions,
} from "@/components/shared/form";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/format-currency";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { createCatalogItem, updateCatalogItem } from "@/features/catalog/actions";
import { ITEM_TYPES } from "@/features/catalog/types";
import type { CatalogItem, ItemType, PackageItem } from "@/features/catalog/types";
import type { ItemCategory, SimpleLookup } from "@/features/master-data/queries";

const CURRENCIES = ["USD", "EUR", "GBP", "SGD", "MYR", "IDR", "AUD", "CAD"];

const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  product: "Product",
  service: "Service",
};

type CatalogFormProps = {
  item?: CatalogItem;
  // Active standalone items available to nest inside a package.
  products?: CatalogItem[];
  // Master data (00068) — empty until configured in Settings, in which
  // case the selects simply offer only the "none" option.
  categories?: ItemCategory[];
  unitsOfMeasure?: SimpleLookup[];
};

export function CatalogForm({
  item,
  products = [],
  categories = [],
  unitsOfMeasure = [],
}: CatalogFormProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();

  const isEditing = !!item;

  const [isPackage, setIsPackage] = useState(item?.is_package ?? false);
  const [currency, setCurrency] = useState(item?.currency ?? workspace.default_currency);
  const [packagePrice, setPackagePrice] = useState(
    item?.package_price != null ? String(item.package_price) : ""
  );
  const [packageItems, setPackageItems] = useState<PackageItem[]>(
    item?.package_items ?? []
  );

  function updatePackageItem(index: number, patch: Partial<PackageItem>) {
    setPackageItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it))
    );
  }

  function removePackageItem(index: number) {
    setPackageItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addCustomLine() {
    setPackageItems((prev) => [
      ...prev,
      { product_id: null, name: "", quantity: 1, unit: null, note: null },
    ]);
  }

  function addProductLine(productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setPackageItems((prev) => [
      ...prev,
      {
        product_id: product.id,
        name: product.name,
        quantity: 1,
        unit: product.default_unit,
        note: null,
      },
    ]);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Client-side guardrails mirroring the server validators, so the user
    // gets the message inline instead of a round-trip rejection.
    if (isPackage) {
      const cleaned = packageItems.filter((it) => it.name.trim() !== "");
      if (cleaned.length === 0) {
        toast("A package needs at least one item", "error");
        return;
      }
      if (packagePrice.trim() === "") {
        toast("A package needs a price", "error");
        return;
      }
    }

    const formData = new FormData(e.currentTarget);

    // Radix Select can't hold an empty-string value, so "no selection" is
    // carried as the "none" sentinel. Normalize it back to "" here, which
    // the validators accept and the action stores as NULL.
    for (const key of ["category_id", "unit_of_measure_id"]) {
      if (formData.get(key) === "none") formData.set(key, "");
    }

    startTransition(async () => {
      const result = isEditing
        ? await updateCatalogItem(workspace.id, item.id, formData)
        : await createCatalogItem(workspace.id, formData);

      if (result.error) {
        toast(result.error, "error");
        return;
      }

      toast(
        isEditing ? "Catalog item updated" : "Catalog item created",
        "success"
      );
      router.push(`/${workspace.slug}/catalog`);
    });
  }

  const cleanedItems = packageItems.filter((it) => it.name.trim() !== "");

  return (
    <form onSubmit={handleSubmit}>
      {/* Hidden controlled fields — the toggle + JSON breakdown don't map
          cleanly to plain inputs, so they ride along as hidden values. */}
      <input type="hidden" name="is_package" value={isPackage ? "package" : "standalone"} />
      <input type="hidden" name="currency" value={currency} />
      <input
        type="hidden"
        name="package_items"
        value={JSON.stringify(isPackage ? cleanedItems : [])}
      />

      <FormSection title={isEditing ? "Edit Catalog Item" : "New Catalog Item"}>
        {/* Type toggle: standalone product vs. a package of items. */}
        <div className="grid grid-cols-2 gap-2">
          <TypeCard
            active={!isPackage}
            title="Standalone"
            description="A single product or service with one price."
            onClick={() => setIsPackage(false)}
          />
          <TypeCard
            active={isPackage}
            title="Package"
            description="A bundle of items sold at one fixed price."
            icon
            onClick={() => setIsPackage(true)}
          />
        </div>

        <FormGrid>
          <FieldGroup label="Name" htmlFor="name" required>
            <Input id="name" name="name" defaultValue={item?.name ?? ""} required maxLength={255} />
          </FieldGroup>

          <FieldGroup label="SKU" htmlFor="sku" hint="Optional, must be unique">
            <Input id="sku" name="sku" defaultValue={item?.sku ?? ""} maxLength={100} />
          </FieldGroup>

          <FieldGroup label="Type" htmlFor="item_type">
            <Select name="item_type" defaultValue={item?.item_type ?? "service"}>
              <SelectTrigger id="item_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ITEM_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ITEM_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldGroup>

          <FieldGroup label="Currency" htmlFor="currency_display" required>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger id="currency_display">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldGroup>

          {isPackage ? (
            <FieldGroup label="Package Price" htmlFor="package_price" required>
              <Input
                key="package_price"
                id="package_price"
                name="package_price"
                type="number"
                min={0}
                step="0.01"
                value={packagePrice}
                onChange={(e) => setPackagePrice(e.target.value)}
                required
              />
            </FieldGroup>
          ) : (
            <FieldGroup label="Default Price" htmlFor="default_unit_price" required>
              <Input
                key="default_unit_price"
                id="default_unit_price"
                name="default_unit_price"
                type="number"
                min={0}
                step="0.01"
                defaultValue={item?.default_unit_price ?? 0}
                required
              />
            </FieldGroup>
          )}

          <FieldGroup
            label="Unit"
            htmlFor="default_unit"
            hint={isPackage ? "e.g. bulan (per month)" : "e.g. hour, page, seat"}
          >
            <Input
              id="default_unit"
              name="default_unit"
              defaultValue={item?.default_unit ?? ""}
              maxLength={50}
              placeholder={isPackage ? "bulan" : "e.g. hour, page, seat"}
            />
          </FieldGroup>

          {/* Master data (00068). Both optional — an item can still be
              created with just the free-text Unit above, which is what
              every pre-existing item uses. */}
          <FieldGroup
            label="Category"
            htmlFor="category_id"
            hint="Manage in Settings → Master Data"
          >
            <Select
              name="category_id"
              defaultValue={item?.category_id ?? "none"}
              key={`cat-${item?.category_id ?? "none"}`}
            >
              <SelectTrigger id="category_id">
                <SelectValue placeholder="Uncategorized" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Uncategorized</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldGroup>

          <FieldGroup
            label="Unit of Measure"
            htmlFor="unit_of_measure_id"
            hint="Standardized unit — manage in Settings → Master Data"
          >
            <Select
              name="unit_of_measure_id"
              defaultValue={item?.unit_of_measure_id ?? "none"}
              key={`uom-${item?.unit_of_measure_id ?? "none"}`}
            >
              <SelectTrigger id="unit_of_measure_id">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {unitsOfMeasure.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({u.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldGroup>

          <FieldGroup label="Status" htmlFor="is_active">
            <Select name="is_active" defaultValue={item && !item.is_active ? "inactive" : "active"}>
              <SelectTrigger id="is_active">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </FieldGroup>
        </FormGrid>

        <FieldGroup label="Description" htmlFor="description">
          <Textarea
            id="description"
            name="description"
            defaultValue={item?.description ?? ""}
            placeholder="Optional"
          />
        </FieldGroup>

        {isPackage && (
          <PackageItemsEditor
            items={packageItems}
            products={products}
            currency={currency}
            packagePrice={packagePrice}
            onUpdate={updatePackageItem}
            onRemove={removePackageItem}
            onAddCustom={addCustomLine}
            onAddProduct={addProductLine}
          />
        )}

        <FormActions>
          <Button type="submit" loading={isPending}>
            {isEditing ? "Update Item" : "Create Item"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </FormActions>
      </FormSection>
    </form>
  );
}

function TypeCard({
  active,
  title,
  description,
  onClick,
  icon,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
  icon?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start rounded-lg border p-3 text-left transition-colors duration-150",
        active
          ? "border-primary/40 bg-primary/[0.04] ring-1 ring-inset ring-primary/20"
          : "hover:border-input hover:bg-muted/40"
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium">
        {icon && <Package className="h-3.5 w-3.5" />}
        {title}
      </span>
      <span className="mt-0.5 text-xs text-muted-foreground">{description}</span>
    </button>
  );
}

function PackageItemsEditor({
  items,
  products,
  currency,
  packagePrice,
  onUpdate,
  onRemove,
  onAddCustom,
  onAddProduct,
}: {
  items: PackageItem[];
  products: CatalogItem[];
  currency: string;
  packagePrice: string;
  onUpdate: (index: number, patch: Partial<PackageItem>) => void;
  onRemove: (index: number) => void;
  onAddCustom: () => void;
  onAddProduct: (productId: string) => void;
}) {
  // Reset the product Select back to its placeholder after each pick so the
  // same product can be added twice in a row.
  const [pickerKey, setPickerKey] = useState(0);
  const priceNum = Number(packagePrice) || 0;

  const summary = useMemo(
    () => items.filter((it) => it.name.trim() !== ""),
    [items]
  );

  return (
    <div className="mt-2 rounded-lg border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Package items</h3>
        <div className="flex items-center gap-2">
          {products.length > 0 && (
            <Select
              key={pickerKey}
              onValueChange={(v) => {
                onAddProduct(v);
                setPickerKey((k) => k + 1);
              }}
            >
              <SelectTrigger className="h-8 w-48 text-[13px]">
                <SelectValue placeholder="Add from products…" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button type="button" variant="outline" size="sm" onClick={onAddCustom}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add custom line
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed bg-card/50 py-6 text-center text-[13px] text-muted-foreground">
          No items yet. Add a product or a custom line — e.g. “Caption &amp;
          Hashtag”, included at no separate charge.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((it, index) => (
            <div
              key={index}
              className="grid grid-cols-[minmax(0,1fr)_64px_72px_28px] items-center gap-2 rounded-md border bg-background p-2"
            >
              <div className="space-y-1">
                <Input
                  value={it.name}
                  onChange={(e) => onUpdate(index, { name: e.target.value })}
                  placeholder="Item name"
                  className="h-8"
                />
                <Input
                  value={it.note ?? ""}
                  onChange={(e) =>
                    onUpdate(index, { note: e.target.value || null })
                  }
                  placeholder="Note (optional) — e.g. 3–5 foto"
                  className="h-7 text-xs"
                />
              </div>
              <Input
                type="number"
                min={0}
                step="1"
                value={it.quantity}
                onChange={(e) =>
                  onUpdate(index, { quantity: Number(e.target.value) || 0 })
                }
                className="h-8 text-center"
                aria-label="Quantity"
              />
              <Input
                value={it.unit ?? ""}
                onChange={(e) => onUpdate(index, { unit: e.target.value || null })}
                placeholder="unit"
                className="h-8"
                aria-label="Unit"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => onRemove(index)}
                aria-label="Remove package item"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Package summary — what the client sees bundled, and the one price
          that counts. */}
      {summary.length > 0 && (
        <div className="mt-4 rounded-md border bg-card p-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Summary
          </p>
          <ul className="mt-2 space-y-1 text-[13px]">
            {summary.map((it, i) => (
              <li key={i} className="flex justify-between gap-3 text-muted-foreground">
                <span className="min-w-0 truncate">
                  {it.quantity}x {it.name}
                  {it.note ? ` — ${it.note}` : ""}
                </span>
                <span className="shrink-0 text-[11px] italic">Termasuk</span>
              </li>
            ))}
          </ul>
          <div className="mt-2.5 flex justify-between border-t pt-2.5 text-sm font-semibold">
            <span>Package price</span>
            <span className="tabular-nums">{formatCurrency(priceNum, currency)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
