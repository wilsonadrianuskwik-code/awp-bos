import Link from "next/link";
import { Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { TopCatalogItem } from "@/features/dashboard/types";

type TopCatalogItemCardProps = {
  item: TopCatalogItem;
  currency: string;
  workspaceSlug: string;
};

/**
 * Single best-selling catalog item this month — a highlight, not a
 * ranked list (that's the Reports "Top Catalog Items" card). Links
 * through to the item's own Catalog detail page, the same click-through
 * precedent Phase 10's report just established, plus a "View full
 * report" link into Reports for the complete breakdown.
 */
export function TopCatalogItemCard({
  item,
  currency,
  workspaceSlug,
}: TopCatalogItemCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          Top Catalog Item This Month
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!item ? (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <Package className="h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              No catalog revenue yet this month.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <Link
              href={`/${workspaceSlug}/catalog/${item.catalogItemId}`}
              className="text-lg font-semibold text-primary hover:underline"
            >
              {item.catalogItemName}
            </Link>
            <p className="text-2xl font-bold">{formatCurrency(item.total, currency)}</p>
            <p className="text-xs text-muted-foreground">
              {item.quantity} sold this month
            </p>
          </div>
        )}
        <Link
          href={`/${workspaceSlug}/reports`}
          className="mt-3 inline-block text-xs text-muted-foreground hover:text-primary hover:underline"
        >
          View full report →
        </Link>
      </CardContent>
    </Card>
  );
}
