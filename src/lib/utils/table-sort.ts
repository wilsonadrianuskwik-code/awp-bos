import type { OnChangeFn, SortingState } from "@tanstack/react-table";

/**
 * Bridges a list page's "sort=field:dir" URL param and DataTable's
 * controlled SortingState, so clicking a column header does the same
 * thing as picking from the page's sort dropdown — one piece of state,
 * two ways to change it — rather than the header running its own
 * independent, page-scoped sort.
 */
export function sortParamToState(sort: string): SortingState {
  const [field, dir] = sort.split(":");
  if (!field) return [];
  return [{ id: field, desc: dir !== "asc" }];
}

export function sortStateToParam(sorting: SortingState, fallback: string): string {
  const s = sorting[0];
  return s ? `${s.id}:${s.desc ? "desc" : "asc"}` : fallback;
}

/**
 * Builds the onSortingChange DataTable expects, wired to a page's
 * `setParams` — accepts tanstack's updater-or-value form, resolves it
 * against the current parsed state, and writes the result straight back
 * to the URL (which is what actually re-runs the server query).
 */
export function makeSortingHandler(
  sort: string,
  setParams: (updates: Record<string, string | null>) => void,
  fallback = "created_at:desc"
): OnChangeFn<SortingState> {
  return (updater) => {
    const current = sortParamToState(sort);
    const next = typeof updater === "function" ? updater(current) : updater;
    setParams({ sort: sortStateToParam(next, fallback), page: null });
  };
}
