/**
 * Merges locally-created records ahead of the server-fetched list,
 * dropping any that appear in both.
 *
 * The inline-create selectors (client, project, supplier) keep what they
 * just created in local state so the picker updates immediately. But the
 * create action revalidates the route, so the parent server component
 * re-fetches and the same record arrives in props a moment later —
 * leaving it in the list twice, with a duplicate React key. Deduping by
 * id makes that race harmless: whichever copy arrives, the record shows
 * once.
 */
export function mergeById<T extends { id: string }>(
  created: T[],
  fetched: T[]
): T[] {
  const seen = new Set(created.map((item) => item.id));
  return [...created, ...fetched.filter((item) => !seen.has(item.id))];
}
