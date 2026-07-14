import type { PaymentMethod } from "@/features/invoices/types";

// Single source of truth for payment-method display labels — reused by
// record-payment-dialog.tsx, payment-history.tsx, and the Phase 9
// payments ledger, instead of each keeping its own copy.
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: "Bank Transfer",
  credit_card: "Credit Card",
  cash: "Cash",
  check: "Check",
  paypal: "PayPal",
  stripe: "Stripe",
  other: "Other",
};

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

/**
 * 0-100 percentage of the invoice total collected so far, for the payment
 * progress bar shown on invoice-card.tsx when status === 'partial'.
 */
export function getPaymentProgress(totalPaid: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((totalPaid / total) * 100)));
}

/**
 * Formats a timestamp for the read-receipt style display ("Viewed / Today
 * 14:31") — Today/Yesterday + 24-hour time for recent events, a full date
 * otherwise. Mirrors quotations/helpers.ts's formatTimelineTimestamp; kept
 * as a separate small copy rather than a cross-feature import, since
 * features don't import from each other in this codebase.
 */
export function formatTimelineTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (date.toDateString() === now.toDateString()) return `Today ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;

  return `${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })} ${time}`;
}
