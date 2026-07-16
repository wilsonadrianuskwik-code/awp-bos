"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { useConfirm } from "@/providers/confirm-provider";
import { deleteCatalogItem } from "@/features/catalog/actions";
import { DetailHeader } from "@/components/shared/detail-header";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { CatalogItem, ItemType } from "@/features/catalog/types";
import type { LineItemCategory } from "@/features/line-items/types";
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
};

export function CatalogDetail({ item, activities }: CatalogDetailProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { workspace, can } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();

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

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <DetailItem
                  label="Default Price"
                  value={formatCurrency(item.default_unit_price, item.currency)}
                />
                <DetailItem label="Currency" value={item.currency} />
                <DetailItem
                  label="Billing Category"
                  value={CATEGORY_LABEL[item.default_category]}
                />
                <DetailItem label="Unit" value={item.default_unit} />
              </dl>
              {item.description && (
                <div className="mt-4">
                  <dt className="text-sm font-medium text-muted-foreground">
                    Description
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm">
                    {item.description}
                  </dd>
                </div>
              )}
            </CardContent>
          </Card>
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
    </div>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{value || "-"}</dd>
    </div>
  );
}
