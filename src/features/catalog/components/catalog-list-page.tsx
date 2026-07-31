"use client";

import { useCallback, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Copy, Power, PowerOff, Trash2, Table2, LayoutGrid } from "lucide-react";
import { Pagination } from "@/components/shared/pagination";
import { ListEmpty } from "@/components/shared/list-empty";
import { SearchInput } from "@/components/shared/search-input";
import { BulkActionToolbar, type BulkAction } from "@/components/shared/bulk-action-toolbar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusTabs } from "@/components/shared/status-tabs";
import { ViewToggle } from "@/components/shared/view-toggle";
import { CatalogTable } from "@/features/catalog/components/catalog-table";
import { makeSortingHandler, sortParamToState } from "@/lib/utils/table-sort";
import { CatalogGrid } from "@/features/catalog/components/catalog-grid";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { useConfirm } from "@/providers/confirm-provider";
import {
  bulkDeleteCatalogItems,
  duplicateCatalogItem,
  setCatalogItemActive,
} from "@/features/catalog/actions";
import type { CatalogItem } from "@/features/catalog/types";

const TYPE_TABS = [
  { value: "all", label: "All" },
  { value: "product", label: "Products" },
  { value: "service", label: "Services" },
] as const;

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active only" },
  { value: "inactive", label: "Inactive only" },
] as const;

const CATEGORY_OPTIONS = [
  { value: "all", label: "All categories" },
  { value: "package", label: "Package" },
  { value: "add_on", label: "Add-on" },
  { value: "per_unit", label: "Per-unit" },
] as const;

const SORT_OPTIONS = [
  { value: "created_at:desc", label: "Newest first" },
  { value: "created_at:asc", label: "Oldest first" },
  { value: "name:asc", label: "Name A–Z" },
  { value: "default_unit_price:desc", label: "Highest price" },
  { value: "default_unit_price:asc", label: "Lowest price" },
] as const;

type CatalogView = "table" | "grid";

const VIEW_OPTIONS: { value: CatalogView; label: string; icon: typeof Table2 }[] = [
  { value: "table", label: "Table", icon: Table2 },
  { value: "grid", label: "Grid", icon: LayoutGrid },
];

const PAGE_SIZE = 20;

type CatalogListPageProps = {
  items: CatalogItem[];
  count: number;
};

export function CatalogListPage({ items, count }: CatalogListPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspace, can } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [, startTransition] = useTransition();

  const itemType = searchParams.get("type") ?? "all";
  const status = searchParams.get("status") ?? "all";
  const category = searchParams.get("category") ?? "all";
  const sort = searchParams.get("sort") ?? "created_at:desc";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const urlSearch = searchParams.get("q") ?? "";
  const view = (searchParams.get("view") === "grid" ? "grid" : "table") as CatalogView;

  const [search, setSearch] = useState(urlSearch);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Deleted rows disappear immediately (optimistic), reconciled once
  // router.refresh() brings back the authoritative list.
  const [optimisticItems, removeOptimisticItems] = useOptimistic(
    items,
    (state, idsToRemove: Set<string>) => state.filter((i) => !idsToRemove.has(i.id))
  );

  const [prevItems, setPrevItems] = useState(items);
  if (items !== prevItems) {
    setPrevItems(items);
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
  const selected = optimisticItems.filter((i) => selectedIds.has(i.id));

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    const ok = await confirm({
      title: `Delete ${selected.length} item${selected.length === 1 ? "" : "s"}?`,
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    const idsToDelete = new Set(selected.map((i) => i.id));
    const toDelete = selected;
    clearSelection();

    startTransition(async () => {
      removeOptimisticItems(idsToDelete);
      const result = await bulkDeleteCatalogItems(workspace.id, toDelete.map((i) => i.id));
      if (result.error !== null) {
        toast(result.error, "error");
      } else {
        const succeeded = result.data.deleted_count;
        const failed = toDelete.length - succeeded;
        toast(
          failed > 0
            ? `Deleted ${succeeded}, ${failed} failed`
            : `Deleted ${succeeded} item${succeeded === 1 ? "" : "s"}`,
          failed > 0 ? "error" : "success"
        );
      }
      router.refresh();
    });
  }

  function handleBulkDuplicate() {
    startTransition(async () => {
      const results = await Promise.all(
        selected.map((i) => duplicateCatalogItem(workspace.id, i.id))
      );
      const failed = results.filter((r) => r.error).length;
      const succeeded = results.length - failed;
      toast(
        failed > 0
          ? `Duplicated ${succeeded}, ${failed} failed`
          : `Duplicated ${succeeded} item${succeeded === 1 ? "" : "s"}`,
        failed > 0 ? "error" : "success"
      );
      clearSelection();
      router.refresh();
    });
  }

  function handleBulkSetActive(active: boolean) {
    startTransition(async () => {
      const results = await Promise.all(
        selected.map((i) => setCatalogItemActive(workspace.id, i.id, active))
      );
      const failed = results.filter((r) => r.error).length;
      const succeeded = results.length - failed;
      toast(
        failed > 0
          ? `Updated ${succeeded}, ${failed} failed`
          : `Marked ${succeeded} item${succeeded === 1 ? "" : "s"} ${active ? "active" : "inactive"}`,
        failed > 0 ? "error" : "success"
      );
      clearSelection();
      router.refresh();
    });
  }

  const bulkActions: BulkAction[] = [
    { label: "Duplicate", icon: Copy, onClick: handleBulkDuplicate },
    { label: "Activate", icon: Power, onClick: () => handleBulkSetActive(true) },
    { label: "Deactivate", icon: PowerOff, onClick: () => handleBulkSetActive(false) },
  ];
  if (can("staff")) {
    bulkActions.push({
      label: "Delete",
      icon: Trash2,
      onClick: handleBulkDelete,
      destructive: true,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search name, SKU, description…"
        />
        <div className="flex flex-wrap items-center gap-2">
          <ViewToggle<CatalogView>
            value={view}
            onChange={(v) => setParams({ view: v === "table" ? null : v })}
            options={VIEW_OPTIONS}
          />
          <Select
            value={category}
            onValueChange={(v) => setParams({ category: v === "all" ? null : v, page: null })}
          >
            <SelectTrigger className="h-9 w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => setParams({ status: v === "all" ? null : v, page: null })}
          >
            <SelectTrigger className="h-9 w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sort}
            onValueChange={(v) => setParams({ sort: v, page: null })}
          >
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
        tabs={TYPE_TABS}
        value={itemType}
        onValueChange={(v) => setParams({ type: v === "all" ? null : v, page: null })}
      />

      {optimisticItems.length === 0 ? (
        <ListEmpty message="No catalog items match your filters." />
      ) : view === "table" ? (
        <CatalogTable
          items={optimisticItems}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          sorting={sorting}
          onSortingChange={onSortingChange}
        />
      ) : (
        <CatalogGrid
          items={optimisticItems}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
        />
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        count={count}
        noun="item"
        onPageChange={(p) => setParams({ page: String(p) })}
      />

      <BulkActionToolbar
        count={selected.length}
        noun="item"
        actions={bulkActions}
        onClear={clearSelection}
      />
    </div>
  );
}
