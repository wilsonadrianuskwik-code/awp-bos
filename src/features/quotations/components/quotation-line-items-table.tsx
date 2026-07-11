import type { LineItem, LineItemCategory } from "@/features/quotations/types";
import { formatCurrency } from "@/lib/utils/format-currency";

const CATEGORY_LABEL: Record<LineItemCategory, string> = {
  package: "Packages",
  add_on: "Add-ons",
  per_unit: "Per-unit",
};

const CATEGORIES: LineItemCategory[] = ["package", "add_on", "per_unit"];

type QuotationLineItemsTableProps = {
  lineItems: LineItem[];
  currency: string;
};

export function QuotationLineItemsTable({
  lineItems,
  currency,
}: QuotationLineItemsTableProps) {
  const fmt = (value: number) => formatCurrency(value, currency);

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
            <table className="w-full text-sm">
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
                {items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
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
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-right text-xs text-muted-foreground">
              Subtotal: {fmt(subtotal)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
