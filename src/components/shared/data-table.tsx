"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useState, type KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Checkbox } from "@/components/ui/checkbox";

type DataTableSelection<TData> = {
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  getId: (row: TData) => string;
};

type DataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  onRowClick?: (row: TData) => void;
  selection?: DataTableSelection<TData>;
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
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
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
        <thead className="border-b bg-muted/40">
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
                  className="h-9 px-3 text-left align-middle text-[11px] font-medium uppercase tracking-wider text-muted-foreground first:pl-4 last:pr-4"
                >
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <button
                      className={cn(
                        "group inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-foreground",
                        header.column.getIsSorted() && "text-foreground"
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
        <tbody>
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
            table.getRowModel().rows.map((row) => {
              const rowId = selection?.getId(row.original);
              const isSelected = rowId ? selection!.selectedIds.has(rowId) : false;
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "group border-b text-[13px] transition-colors duration-100 last:border-0 hover:bg-muted/40",
                    isSelected && "bg-primary/5",
                    onRowClick &&
                      "cursor-pointer outline-none focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
                  )}
                  onClick={() => onRowClick?.(row.original)}
                  {...(onRowClick && {
                    role: "button",
                    tabIndex: 0,
                    onKeyDown: (e: KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(row.original);
                      }
                    },
                  })}
                >
                  {selection && (
                    <td
                      className="px-3 py-2.5 align-middle first:pl-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleRow(rowId!)}
                        aria-label="Select row"
                      />
                    </td>
                  )}
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-3 py-2.5 align-middle first:pl-4 last:pr-4"
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
