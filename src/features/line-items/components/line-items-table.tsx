import { Fragment } from "react";
import type { LineItem, LineItemCategory } from "@/features/line-items/types";
import type { PackageItem } from "@/features/catalog/types";
import { PackageBreakdown } from "@/features/catalog/components/package-breakdown";
import { formatCurrency } from "@/lib/utils/format-currency";

const CATEGORY_LABEL: Record<LineItemCategory, string> = {
  package: "Packages",
  add_on: "Add-ons",
  per_unit: "Per-unit",
};

const CATEGORIES: LineItemCategory[] = ["package", "add_on", "per_unit"];

type LineItemsTableProps = {
  lineItems: LineItem[];
  /** Live package contents by catalog_item_id — see getPackageBreakdowns.
      A line item whose catalog_item_id has an entry here renders its
      breakdown beneath the row, for internal staff visibility (the same
      breakdown the client sees on the printed document). */
  packageBreakdowns?: Record<string, PackageItem[]>;
};

export function LineItemsTable({ lineItems, packageBreakdowns = {} }: LineItemsTableProps) {
  const fmt = (value: number) => formatCurrency(value);

  return (
    <div className="space-y-6">
      {CATEGORIES.map((cat) => {
        const items = lineItems.filter((i) => i.category === cat);
        if (items.length === 0) return null;
        const subtotal = items.reduce((sum, i) => sum + i.line_total, 0);

        return (
          <div key={cat}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {CATEGORY_LABEL[cat]}
            </h4>
            {/* Six columns of figures don't fit a phone: the table scrolls
                inside its own box rather than pushing the whole page
                sideways, which used to make every card overflow. */}
            <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Description</th>
                  <th className="py-2 text-right font-medium">Qty</th>
                  <th className="py-2 text-right font-medium">Unit Price</th>
                  <th className="py-2 text-right font-medium">Disc.</th>
                  <th className="py-2 text-right font-medium">Tax</th>
                  <th className="py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const breakdown = item.catalog_item_id
                    ? packageBreakdowns[item.catalog_item_id]
                    : undefined;
                  return (
                    <Fragment key={item.id}>
                      <tr className={breakdown ? "border-0" : "border-b last:border-0"}>
                        <td className="py-2 pr-2">
                          {item.description}
                          {item.unit && (
                            <span className="text-muted-foreground"> / {item.unit}</span>
                          )}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {item.quantity}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {fmt(item.unit_price)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {item.discount_percent ? `${item.discount_percent}%` : "-"}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {item.tax_percent ? `${item.tax_percent}%` : "-"}
                        </td>
                        <td className="py-2 text-right font-medium tabular-nums">
                          {fmt(item.line_total)}
                        </td>
                      </tr>
                      {breakdown && breakdown.length > 0 && (
                        <tr key={`${item.id}-breakdown`} className="border-b last:border-0">
                          <td colSpan={6} className="pb-2.5 pl-4 pt-0">
                            <PackageBreakdown items={breakdown} dense />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>
            <p className="mt-1 text-right text-xs text-muted-foreground">
              Subtotal: {fmt(subtotal)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
