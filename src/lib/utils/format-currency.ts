// The business trades exclusively in rupiah, so the app is IDR-only: there
// is no currency picker, no per-document currency, and no FX conversion
// anywhere (there never was — amounts in different currencies could only
// ever be listed side by side, never summed).
//
// Formatting is deliberately not left to Intl's currency mode, whose
// ICU data varies across Node and browser versions and can silently change
// the symbol, its placement, or the spacing after it. The prefix is fixed
// here and only the digit grouping comes from Intl, so output is identical
// everywhere.
//
// Rupiah convention: no decimals, period as the thousands separator
// (id-ID), e.g. "Rp 1.250.000".
const PREFIX = "Rp ";
const LOCALE = "id-ID";
const DECIMALS = 0;

/** The only currency the app supports. */
export const CURRENCY = "IDR";

/** Full formatted amount, e.g. formatCurrency(1250000) -> "Rp 1.250.000". */
export function formatCurrency(amount: number): string {
  const number = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: DECIMALS,
    maximumFractionDigits: DECIMALS,
  }).format(amount);
  return `${PREFIX}${number}`;
}

/** Just the symbol, trimmed — for compact use inside input fields. */
export function getCurrencyPrefix(): string {
  return PREFIX.trim();
}

/**
 * Sums a set of amounts. Kept as a single-group result so the aggregation
 * RPCs and the callers that spread their output need no reshaping; with one
 * currency it is now always exactly one entry, and unlike before the sum is
 * meaningful because every row is rupiah.
 */
export function sumByCurrency(
  rows: { currency?: string; amount: number }[]
): { currency: string; amount: number }[] {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return [{ currency: CURRENCY, amount: total }];
}

/**
 * Formats a set of per-currency amounts into one display string. Everything
 * is rupiah now, so these add up into a single figure rather than being
 * listed side by side with a separator — an empty list is simply zero.
 */
export function formatCurrencyAmounts(
  amounts: { amount: number; currency?: string }[]
): string {
  return formatCurrency(amounts.reduce((sum, a) => sum + a.amount, 0));
}
