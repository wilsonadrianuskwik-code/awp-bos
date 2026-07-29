"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, Package, Pencil, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { useConfirm } from "@/providers/confirm-provider";
import {
  deleteCatalogItem,
  duplicateCatalogItem,
  removeCatalogItemClientPrice,
} from "@/features/catalog/actions";
import { DetailHeader } from "@/components/shared/detail-header";
import { FieldList, DetailItem } from "@/components/shared/detail-item";
import { SummaryHero } from "@/components/shared/summary-hero";
import { PackageBreakdown } from "@/features/catalog/components/package-breakdown";
import { ClientPriceDialog } from "@/features/catalog/components/client-price-dialog";
import { formatCurrency } from "@/lib/utils/format-currency";
import type {
  CatalogItem,
  CatalogItemClientPrice,
  CatalogItemUsage,
  ItemType,
} from "@/features/catalog/types";
import type { ClientSummary, LineItemCategory } from "@/features/line-items/types";
import type { Activity } from "@/features/activities/types";

const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  product: "Product",
  service: "Service",
};

const CATEGORY_LABEL: Record<LineItemCategory, string> = {
  package: "Package",
  add_on: "Add-on",
  per_unit: "Per-unit",
};

type CatalogDetailProps = {
  item: CatalogItem;
  activities: Activity[];
  usage: CatalogItemUsage;
  clients: ClientSummary[];
  clientPrices: CatalogItemClientPrice[];
};

export function CatalogDetail({
  item,
  activities,
  usage,
  clients,
  clientPrices,
}: CatalogDetailProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { workspace, can } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [prices, setPrices] = useState(clientPrices);
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);

  async function handleRemovePrice(price: CatalogItemClientPrice) {
    const ok = await confirm({
      title: `Remove ${price.client_name}'s custom price?`,
      description: "They'll go back to the default price.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;

    startTransition(async () => {
      const result = await removeCatalogItemClientPrice(workspace.id, item.id, price.id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      setPrices((prev) => prev.filter((p) => p.id !== price.id));
      toast("Custom price removed", "success");
    });
  }

  function handleDuplicate() {
    startTransition(async () => {
      const result = await duplicateCatalogItem(workspace.id, item.id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast(`Duplicated as "${result.data!.name}"`, "success");
      router.push(`/${workspace.slug}/catalog/${result.data!.id}`);
    });
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete this catalog item?",
      description: "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    startTransition(async () => {
      const result = await deleteCatalogItem(workspace.id, item.id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Catalog item deleted", "success");
      router.push(`/${workspace.slug}/catalog`);
    });
  }

  return (
    <div className="space-y-6">
      <DetailHeader
        backHref={`/${workspace.slug}/catalog`}
        backLabel="Back to Catalog"
        title={item.name}
        badges={
          <>
            {item.is_package && (
              <Badge variant="secondary">
                <Package className="mr-1 h-3 w-3" />
                Paket
              </Badge>
            )}
            <Badge variant="secondary">{ITEM_TYPE_LABEL[item.item_type]}</Badge>
            {item.is_active ? (
              <Badge>Active</Badge>
            ) : (
              <Badge variant="secondary">Inactive</Badge>
            )}
          </>
        }
        subtitle={item.sku ? `SKU: ${item.sku}` : undefined}
        actions={
          can("staff") ? (
            <>
              <Button variant="outline" onClick={handleDuplicate} disabled={isPending}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/${workspace.slug}/catalog/${item.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </>
          ) : undefined
        }
      />

      <SummaryHero
        primaryLabel={item.is_package ? "Package Price" : "Default Price"}
        primaryValue={formatCurrency(
          item.is_package ? (item.package_price ?? 0) : item.default_unit_price,
          item.currency
        )}
        secondaryMetrics={[
          { label: "Type", value: ITEM_TYPE_LABEL[item.item_type] },
          ...(item.is_package
            ? [{ label: "Items", value: String(item.package_items.length) }]
            : [{ label: "Category", value: CATEGORY_LABEL[item.default_category] }]),
          ...(item.default_unit ? [{ label: "Unit", value: item.default_unit }] : []),
          { label: "Used In", value: `${usage.documentCount} document${usage.documentCount === 1 ? "" : "s"}` },
          { label: "Total Quantity Sold", value: String(usage.totalQuantity) },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldList>
                <DetailItem
                  label={item.is_package ? "Package Price" : "Default Price"}
                  value={formatCurrency(
                    item.is_package ? (item.package_price ?? 0) : item.default_unit_price,
                    item.currency
                  )}
                />
                <DetailItem label="Currency" value={item.currency} />
                {!item.is_package && (
                  <DetailItem
                    label="Billing Category"
                    value={CATEGORY_LABEL[item.default_category]}
                  />
                )}
                <DetailItem label="Unit" value={item.default_unit} />
              </FieldList>
              {item.description && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-muted-foreground">
                    Description
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    {item.description}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {item.is_package && (
            <Card>
              <CardHeader>
                <CardTitle>Package Items</CardTitle>
              </CardHeader>
              <CardContent>
                <PackageBreakdown items={item.package_items} />
              </CardContent>
            </Card>
          )}

          {!item.is_package && (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Customer Pricing</CardTitle>
                {can("staff") && (
                  <Button size="sm" variant="outline" onClick={() => setPriceDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Price
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {prices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Every client pays the default price
                    {" "}({formatCurrency(item.default_unit_price, item.currency)}).
                    Add an override for a client who gets a different rate.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {prices.map((price) => (
                      <li
                        key={price.id}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <span className="flex min-w-0 items-center gap-2 truncate text-sm">
                          <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate font-medium">{price.client_name}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          <span className="text-sm tabular-nums">
                            {formatCurrency(price.unit_price, item.currency)}
                          </span>
                          {can("staff") && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              disabled={isPending}
                              onClick={() => handleRemovePrice(price)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline activities={activities} />
            </CardContent>
          </Card>
        </div>
      </div>

      <ClientPriceDialog
        open={priceDialogOpen}
        onOpenChange={setPriceDialogOpen}
        catalogItemId={item.id}
        currency={item.currency}
        clients={clients}
        onSaved={(price) =>
          setPrices((prev) => [price, ...prev.filter((p) => p.id !== price.id)])
        }
      />
    </div>
  );
}

