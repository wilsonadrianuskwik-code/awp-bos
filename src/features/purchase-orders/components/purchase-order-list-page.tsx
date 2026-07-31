"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Pagination } from "@/components/shared/pagination";
import { ListEmpty } from "@/components/shared/list-empty";
import { SearchInput } from "@/components/shared/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusTabs } from "@/components/shared/status-tabs";
import { ViewToggle, type ListView } from "@/components/shared/view-toggle";
import { PurchaseOrderTable } from "@/features/purchase-orders/components/purchase-order-table";
import { makeSortingHandler, sortParamToState } from "@/lib/utils/table-sort";
import { PurchaseOrderKanbanBoard } from "@/features/purchase-orders/components/purchase-order-kanban-board";
import type { PurchaseOrderWithRelations } from "@/features/purchase-orders/types";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "partially_received", label: "Partially Received" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
] as const;

const SORT_OPTIONS = [
  { value: "created_at:desc", label: "Newest first" },
  { value: "created_at:asc", label: "Oldest first" },
  { value: "total:desc", label: "Highest value" },
  { value: "total:asc", label: "Lowest value" },
  { value: "expected_date:asc", label: "Expected soon" },
] as const;

const PAGE_SIZE = 20;

type PurchaseOrderListPageProps = {
  purchaseOrders: PurchaseOrderWithRelations[];
  count: number;
};

export function PurchaseOrderListPage({ purchaseOrders, count }: PurchaseOrderListPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = searchParams.get("status") ?? "all";
  const sort = searchParams.get("sort") ?? "created_at:desc";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const urlSearch = searchParams.get("q") ?? "";
  const view = (searchParams.get("view") === "kanban" ? "kanban" : "table") as ListView;

  const [search, setSearch] = useState(urlSearch);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [prevPOs, setPrevPOs] = useState(purchaseOrders);
  if (purchaseOrders !== prevPOs) {
    setPrevPOs(purchaseOrders);
    setSelectedIds(new Set());
  }

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  // Drives the table's clickable column headers off the same `sort` param
  // as the dropdown, rather than letting DataTable's own client-side sort
  // quietly reorder only the current page.
  const sorting = sortParamToState(sort);
  const onSortingChange = makeSortingHandler(sort, setParams);

  useEffect(() => {
    if (search === urlSearch) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setParams({ q: search || null, page: null });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, urlSearch, setParams]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search PO number, title, supplier…"
        />
        <div className="flex flex-wrap items-center gap-2">
          <ViewToggle value={view} onChange={(v) => setParams({ view: v === "table" ? null : v })} />
          <Select value={sort} onValueChange={(v) => setParams({ sort: v, page: null })}>
            <SelectTrigger className="h-9 w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <StatusTabs
        tabs={STATUS_TABS}
        value={status}
        onValueChange={(v) => setParams({ status: v === "all" ? null : v, page: null })}
      />

      {purchaseOrders.length === 0 ? (
        <ListEmpty message="No purchase orders match your filters." />
      ) : view === "table" ? (
        <PurchaseOrderTable
          purchaseOrders={purchaseOrders}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          sorting={sorting}
          onSortingChange={onSortingChange}
        />
      ) : (
        <PurchaseOrderKanbanBoard
          purchaseOrders={purchaseOrders}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
        />
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        count={count}
        noun="purchase order"
        onPageChange={(p) => setParams({ page: String(p) })}
      />
    </div>
  );
}
