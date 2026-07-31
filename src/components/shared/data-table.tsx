"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type SortingState,
} from "@tanstack/react-table";
import { useRef, useState, type KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Checkbox } from "@/components/ui/checkbox";
import { STATUS_TONE, TONE_ROW_ACCENT } from "@/components/shared/status-badge";

type DataTableSelection<TData> = {
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  getId: (row: TData) => string;
  // Optional: overrides the default plain-toggle-on-click with a richer
  // selection gesture (shift-range-select). Omitted = unchanged behavior
  // (a checkbox click always just toggles that one row), so every existing
  // caller of DataTable keeps working with no change.
  onItemClick?: (
    id: string,
    index: number,
    orderedIds: string[],
    event: { shiftKey: boolean }
  ) => void;
};

type DataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  onRowClick?: (row: TData) => void;
  selection?: DataTableSelection<TData>;
  /**
   * The status each row reports, used to tint its left edge. Optional:
   * a table with no lifecycle (clients, catalog items) passes nothing
   * and renders exactly as before.
   */
  getRowStatus?: (row: TData) => string | null | undefined;
  /**
   * Server-driven sort, for a table backed by a paginated, server-sorted
   * query. Pass both together and DataTable stops sorting rows itself —
   * its own getSortedRowModel only ever sees whatever page was fetched,
   * so left uncontrolled it can only reorder the rows already on screen,
   * not the underlying dataset a click on a header implies. Instead it
   * reports the click upward via onSortingChange so the caller can turn
   * it into a query param and refetch the real order from the server.
   * Omit both for a table that loads its entire dataset at once (no
   * pagination) — there every row is already on screen, so client-side
   * sorting is correct on its own and this is unnecessary.
   */
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
};

// List-view table. Density and hierarchy follow the system's table spec:
// 13px cell text, 11px uppercase column labels, ~40px rows, hairline row
// separators, quiet hover. Numeric columns should set `tabular-nums` in
// their cell renderers so digits align.
export function DataTable<TData>({
  columns,
  data,
  onRowClick,
  selection,
  getRowStatus,
  sorting: controlledSorting,
  onSortingChange,
}: DataTableProps<TData>) {
  const [localSorting, setLocalSorting] = useState<SortingState>([]);
  const isControlled = controlledSorting !== undefined;
  const sorting = isControlled ? controlledSorting : localSorting;
  // Recorded from the checkbox cell's capture-phase click, since Radix
  // Checkbox's onCheckedChange doesn't hand back the native event — capture
  // fires before the checkbox's own click handling, so this is always set
  // before onItemClick reads it for the same click.
  const shiftPressedRef = useRef(false);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: isControlled ? onSortingChange : setLocalSorting,
    // Tells the table the data it was handed is already in the right
    // order (the server's), so it should render sorting affordances from
    // `sorting` without re-deriving order from getSortedRowModel — the
    // other half of not sorting only the current page in place.
    manualSorting: isControlled,
    state: { sorting },
  });

  const pageIds = selection ? data.map(selection.getId) : [];
  const selectedOnPage = selection
    ? pageIds.filter((id) => selection.selectedIds.has(id))
    : [];
  const allOnPageSelected =
    pageIds.length > 0 && selectedOnPage.length === pageIds.length;
  const someOnPageSelected =
    selectedOnPage.length > 0 && !allOnPageSelected;

  function toggleAllOnPage() {
    if (!selection) return;
    const next = new Set(selection.selectedIds);
    if (allOnPageSelected) {
      for (const id of pageIds) next.delete(id);
    } else {
      for (const id of pageIds) next.add(id);
    }
    selection.onSelectedIdsChange(next);
  }

  function toggleRow(id: string) {
    if (!selection) return;
    const next = new Set(selection.selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.onSelectedIdsChange(next);
  }

  const colSpan = columns.length + (selection ? 1 : 0);

  return (
    <div className="overflow-x-auto rounded-lg border bg-card shadow-2xs">
      <table className="w-full caption-bottom">
        <thead className="sticky top-0 z-10 border-b-2 border-primary/25 bg-gradient-to-b from-primary/[0.07] to-primary/[0.02] backdrop-blur-sm">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {selection && (
                <th className="h-9 w-9 px-3 text-left align-middle first:pl-4">
                  <Checkbox
                    checked={
                      allOnPageSelected
                        ? true
                        : someOnPageSelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={toggleAllOnPage}
                    aria-label="Select all on this page"
                  />
                </th>
              )}
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="h-9 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-wider text-foreground/70 first:pl-4 last:pr-4"
                >
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <button
                      className={cn(
                        "group inline-flex items-center gap-1 uppercase tracking-wider transition-colors duration-150 hover:text-primary",
                        header.column.getIsSorted() && "text-primary"
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {/* Direction-aware indicator: the ambiguous both-ways
                          glyph only shows pre-sort; once sorted, the arrow
                          states the actual order. */}
                      {header.column.getIsSorted() === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : header.column.getIsSorted() === "desc" ? (
                        <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-50 transition-opacity group-hover:opacity-100" />
                      )}
                    </button>
                  ) : (
                    flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="stagger-rows">
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td
                colSpan={colSpan}
                className="h-24 text-center text-[13px] text-muted-foreground"
              >
                No results.
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row, rowIndex) => {
              const rowId = selection?.getId(row.original);
              const isSelected = rowId ? selection!.selectedIds.has(rowId) : false;
              const status = getRowStatus?.(row.original);
              const tone = status ? STATUS_TONE[status] : undefined;

              // The status stripe is a pseudo-element on the row's FIRST
              // CELL, never on the <tr> itself. A table-row may only
              // contain table-cells, so a ::before attached to a <tr>
              // gets wrapped by the browser in an *anonymous table
              // cell* — which claims column 0 and pushes every real <td>
              // one column to the right, while the header (no
              // pseudo-element) stays put. The result is a whole table
              // whose data sits under the wrong headings, plus an
              // unlabelled blank column at the end. Being absolutely
              // positioned does not save it: the anonymous cell is
              // generated during box construction, before layout.
              // A <td> holds pseudo-elements in normal flow, so hanging
              // the stripe there is safe. It still resolves against the
              // <tr>'s `relative`, so it spans the full row height.
              const stripeClass =
                "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:origin-left before:scale-x-0 before:opacity-0 " +
                "before:transition-[transform,opacity] before:duration-200 before:[transition-timing-function:var(--spring-standard)] " +
                (tone
                  ? `${TONE_ROW_ACCENT[tone]} before:scale-x-100 before:opacity-60 group-hover:before:opacity-100 group-hover:before:w-[4px]`
                  : "");

              return (
                <tr
                  key={row.id}
                  className={cn(
                    "group relative border-b text-[13px] transition-colors duration-150 [transition-timing-function:var(--spring-crisp)] last:border-0 hover:bg-muted/50",
                    isSelected && "bg-primary/5",
                    onRowClick &&
                      "cursor-pointer outline-none focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
                  )}
                  onClick={() => onRowClick?.(row.original)}
                  {...(onRowClick && {
                    role: "button",
                    tabIndex: 0,
                    onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(row.original);
                        return;
                      }
                      // Arrow keys walk focus row-to-row without opening
                      // anything — DOM order matches visual order, so the
                      // adjacent <tr> sibling is always the right target.
                      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                        e.preventDefault();
                        const sibling =
                          e.key === "ArrowDown"
                            ? e.currentTarget.nextElementSibling
                            : e.currentTarget.previousElementSibling;
                        (sibling as HTMLElement | null)?.focus();
                      }
                    },
                  })}
                >
                  {selection && (
                    <td
                      className={cn(
                        "px-3 py-2.5 align-middle first:pl-4",
                        stripeClass
                      )}
                      onClick={(e) => e.stopPropagation()}
                      onClickCapture={(e) => {
                        shiftPressedRef.current = e.shiftKey;
                      }}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => {
                          if (selection!.onItemClick) {
                            selection!.onItemClick(rowId!, rowIndex, pageIds, {
                              shiftKey: shiftPressedRef.current,
                            });
                          } else {
                            toggleRow(rowId!);
                          }
                        }}
                        aria-label="Select row"
                      />
                    </td>
                  )}
                  {row.getVisibleCells().map((cell, cellIndex) => (
                    <td
                      key={cell.id}
                      className={cn(
                        "px-3 py-2.5 align-middle first:pl-4 last:pr-4",
                        // Only when there's no checkbox cell to carry it.
                        !selection && cellIndex === 0 && stripeClass
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
