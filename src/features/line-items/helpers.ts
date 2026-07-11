import type { LineItemInput } from "@/features/line-items/validators";

export type LineItemTotals = {
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
};

/**
 * Single source of truth for line-item totals, used both server-side (to
 * persist subtotal/tax_amount/discount_amount/total) and client-side (for
 * live totals in the quotation/invoice builders). Mirrors the
 * line_items.line_total generated column:
 * quantity * unit_price * (1 - discount_percent/100).
 */
export function computeLineItemTotals(
  lineItems: LineItemInput[]
): LineItemTotals {
  let subtotal = 0;
  let discount_amount = 0;
  let tax_amount = 0;

  for (const item of lineItems) {
    const itemSubtotal = item.quantity * item.unit_price;
    const itemDiscount = itemSubtotal * ((item.discount_percent ?? 0) / 100);
    const lineTotal = itemSubtotal - itemDiscount;
    const itemTax = lineTotal * ((item.tax_percent ?? 0) / 100);

    subtotal += itemSubtotal;
    discount_amount += itemDiscount;
    tax_amount += itemTax;
  }

  const total = subtotal - discount_amount + tax_amount;

  return {
    subtotal: round2(subtotal),
    discount_amount: round2(discount_amount),
    tax_amount: round2(tax_amount),
    total: round2(total),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
