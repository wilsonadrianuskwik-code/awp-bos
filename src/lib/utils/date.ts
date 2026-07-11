const MS_PER_DAY = 86_400_000;

/**
 * Whole days a date is in the past relative to now — e.g. for the invoice
 * "Overdue • N days" display. Purely a date-diff calculation with no
 * domain coupling, so it lives here rather than inside a single feature's
 * helpers, letting any feature (invoices, clients, ...) use it without a
 * cross-feature import. Only meaningful when the date is actually in the
 * past — callers should gate on their own status/condition first.
 */
export function getOverdueDays(date: string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / MS_PER_DAY);
}
