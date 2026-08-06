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

/**
 * A date as dd/mm/yyyy, e.g. 26/07/2026.
 *
 * The locale is pinned deliberately. Bare `toLocaleDateString()` uses
 * whatever locale the runtime has, which is the *server's* during SSR
 * and the *browser's* after hydration — so a row rendered 7/26/2026 on
 * the server became 26/07/2026 on the client and React reported a
 * hydration mismatch. Pinning the format makes both sides agree, and
 * dd/mm/yyyy is the convention the documents already print in.
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const parsed = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** The longer form used in document headers, e.g. 26 Jul 2026. */
export function formatDateLong(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const parsed = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Date and time together, for audit trails — "06 Aug 2026, 21:19".
 *
 * 24-hour, because these are timestamps to be compared with each other
 * rather than read aloud, and am/pm makes that harder at a glance.
 * Rendered in the reader's own timezone, which is what someone asking
 * "when was this changed?" means.
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const parsed = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
