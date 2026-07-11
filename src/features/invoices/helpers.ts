// Indonesian bank options for the Record Payment dialog's bank-name picker
// (Milestone 7). Free-text "Other" fallback means new banks never require
// a code change — bank_name is a plain TEXT column, not a DB enum.
export const BANK_OPTIONS = [
  "BCA",
  "Mandiri",
  "BNI",
  "BRI",
  "CIMB Niaga",
  "OCBC NISP",
  "Permata",
  "Other",
] as const;

const MS_PER_DAY = 86_400_000;

/**
 * Whole days an invoice is past its due date, for the "Overdue • N days"
 * display on invoice-card.tsx and invoice-detail.tsx. Only meaningful when
 * the invoice is actually overdue — callers should gate on status.
 */
export function getOverdueDays(dueDate: string): number {
  return Math.floor((Date.now() - new Date(dueDate).getTime()) / MS_PER_DAY);
}

/**
 * 0-100 percentage of the invoice total collected so far, for the payment
 * progress bar shown on invoice-card.tsx when status === 'partial'.
 */
export function getPaymentProgress(totalPaid: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((totalPaid / total) * 100)));
}
