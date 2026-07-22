// Small vanilla-Date helpers shared by the Calendar and Timeline views —
// no date library exists anywhere in this codebase (confirmed: package.json
// has no date-fns/dayjs/luxon), so these stay purpose-built and minimal
// rather than pulling in a new dependency for a handful of operations.
//
// `scheduled_date` (and `posted_at`, truncated) are always plain `YYYY-MM-DD`
// strings from Postgres `DATE` columns. Parsing those with `new Date(str)`
// interprets them as UTC midnight, which can render as the previous day in
// timezones behind UTC — every parse here goes through `parseISODate` to
// build the Date from its year/month/day parts directly, in local time,
// avoiding that off-by-one.

export function parseISODate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// Sunday-start week, matching this app's other date displays (no
// Monday-start convention established anywhere else in the codebase).
export function startOfWeek(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() - next.getDay());
  next.setHours(0, 0, 0, 0);
  return next;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// Full calendar grid for a month view: always 6 weeks (42 days) so the
// grid's height never jumps between months, starting from the Sunday
// on/before the 1st.
export function getMonthGridDays(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = startOfWeek(firstOfMonth);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

// Groups items by their exact scheduled_date string — no parsing needed,
// since the field is already the canonical YYYY-MM-DD key a day cell wants
// to look up.
export function groupByDateKey<T>(
  items: T[],
  getDateKey: (item: T) => string
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = getDateKey(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}

export type WeekGroup<T> = { weekStart: Date; items: T[] };

// Buckets items by the Sunday-start week their date falls in, returned in
// ascending week order — shared by Timeline's Upcoming/Completed sections.
export function groupByWeek<T>(
  items: T[],
  getDateKey: (item: T) => string
): WeekGroup<T>[] {
  const buckets = new Map<string, WeekGroup<T>>();
  for (const item of items) {
    const weekStart = startOfWeek(parseISODate(getDateKey(item)));
    const key = formatISODate(weekStart);
    const existing = buckets.get(key);
    if (existing) existing.items.push(item);
    else buckets.set(key, { weekStart, items: [item] });
  }
  return [...buckets.values()].sort(
    (a, b) => a.weekStart.getTime() - b.weekStart.getTime()
  );
}
