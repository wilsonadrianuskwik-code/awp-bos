"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { createCatalogItem, updateCatalogItem } from "@/features/catalog/actions";
import { ITEM_TYPES } from "@/features/catalog/types";
import { LINE_ITEM_CATEGORIES, type LineItemCategory } from "@/features/line-items/types";
import type { CatalogItem, ItemType } from "@/features/catalog/types";

const CURRENCIES = ["USD", "EUR", "GBP", "SGD", "MYR", "IDR", "AUD", "CAD"];

const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  product: "Product",
  service: "Service",
};

const CATEGORY_LABEL: Record<LineItemCategory, string> = {
  package: "Package",
  add_on: "Add-on",
  per_unit: "Per-unit",
};

type CatalogFormProps = {
  item?: CatalogItem;
};

export function CatalogForm({ item }: CatalogFormProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();

  const isEditing = !!item;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = isEditing
        ? await updateCatalogItem(workspace.id, item.id, formData)
        : await createCatalogItem(workspace.id, formData);

      if (result.error) {
        toast(result.error, "error");
        return;
      }

      toast(
        isEditing
          ? "Catalog item updated successfully"
          : "Catalog item created successfully",
        "success"
      );
      router.push(`/${workspace.slug}/catalog`);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? "Edit Catalog Item" : "New Catalog Item"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                name="name"
                defaultValue={item?.name ?? ""}
                required
                maxLength={255}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              <Input
                id="sku"
                name="sku"
                defaultValue={item?.sku ?? ""}
                maxLength={100}
                placeholder="Optional, must be unique"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="item_type">Type</Label>
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="default_category">Billing Category</Label>
              <Select
                name="default_category"
                defaultValue={item?.default_category ?? "per_unit"}
              >
                <SelectTrigger id="default_category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINE_ITEM_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="default_unit_price">Default Price *</Label>
              <Input
                id="default_unit_price"
                name="default_unit_price"
                type="number"
                min={0}
                step="0.01"
                defaultValue={item?.default_unit_price ?? 0}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Currency *</Label>
              <Select name="currency" defaultValue={item?.currency ?? workspace.default_currency}>
                <SelectTrigger id="currency">
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="default_unit">Unit</Label>
              <Input
                id="default_unit"
                name="default_unit"
                defaultValue={item?.default_unit ?? ""}
                maxLength={50}
                placeholder="e.g. hour, page, seat"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="is_active">Status</Label>
              <Select
                name="is_active"
                defaultValue={
                  item && !item.is_active ? "inactive" : "active"
                }
              >
                <SelectTrigger id="is_active">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={item?.description ?? ""}
              placeholder="Optional"
            />
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={isPending}>
              {isPending
                ? isEditing
                  ? "Updating..."
                  : "Creating..."
                : isEditing
                  ? "Update Item"
                  : "Create Item"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
