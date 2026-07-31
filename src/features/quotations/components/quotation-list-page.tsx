"use client";

import { useCallback, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Copy, Download, Send, Trash2 } from "lucide-react";
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
import { ViewToggle, type ListView } from "@/components/shared/view-toggle";
import { QuotationTable } from "@/features/quotations/components/quotation-table";
import { makeSortingHandler, sortParamToState } from "@/lib/utils/table-sort";
import { QuotationKanbanBoard } from "@/features/quotations/components/quotation-kanban-board";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { useConfirm } from "@/providers/confirm-provider";
import {
  bulkDeleteQuotations,
  duplicateQuotation,
  updateQuotationStatus,
} from "@/features/quotations/actions";
import type { QuotationWithClient } from "@/features/quotations/types";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "viewed", label: "Viewed" },
  { value: "approved", label: "Approved" },
  { value: "revision_requested", label: "Revision" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
] as const;

const SORT_OPTIONS = [
  { value: "created_at:desc", label: "Newest first" },
  { value: "created_at:asc", label: "Oldest first" },
  { value: "total:desc", label: "Highest value" },
  { value: "total:asc", label: "Lowest value" },
  { value: "expiry_date:asc", label: "Expiring soon" },
] as const;

const PAGE_SIZE = 20;

type QuotationListPageProps = {
  quotations: QuotationWithClient[];
  count: number;
};

export function QuotationListPage({ quotations, count }: QuotationListPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspace, can } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [, startTransition] = useTransition();

  const status = searchParams.get("status") ?? "all";
  const sort = searchParams.get("sort") ?? "created_at:desc";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const urlSearch = searchParams.get("q") ?? "";
  const view = (searchParams.get("view") === "kanban" ? "kanban" : "table") as ListView;

  const [search, setSearch] = useState(urlSearch);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Deleted rows disappear immediately (optimistic), reconciled once
  // router.refresh() brings back the authoritative list — if a delete
  // actually failed server-side, the refreshed list still has that row
  // and it simply reappears rather than staying gone.
  const [optimisticQuotations, removeOptimisticQuotations] = useOptimistic(
    quotations,
    (state, idsToRemove: Set<string>) => state.filter((q) => !idsToRemove.has(q.id))
  );

  // Adjusted during render (not an effect), per React's "you might not
  // need an effect" guidance for resetting state when a prop changes.
  const [prevQuotations, setPrevQuotations] = useState(quotations);
  if (quotations !== prevQuotations) {
    setPrevQuotations(quotations);
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
  const selected = optimisticQuotations.filter((q) => selectedIds.has(q.id));

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    const ok = await confirm({
      title: `Delete ${selected.length} quotation${selected.length === 1 ? "" : "s"}?`,
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    const idsToDelete = new Set(selected.map((q) => q.id));
    const toDelete = selected;
    clearSelection();

    startTransition(async () => {
      removeOptimisticQuotations(idsToDelete);
      const result = await bulkDeleteQuotations(workspace.id, toDelete.map((q) => q.id));
      if (result.error !== null) {
        toast(result.error, "error");
      } else {
        const succeeded = result.data.deleted_count;
        const failed = toDelete.length - succeeded;
        toast(
          failed > 0
            ? `Deleted ${succeeded}, ${failed} failed`
            : `Deleted ${succeeded} quotation${succeeded === 1 ? "" : "s"}`,
          failed > 0 ? "error" : "success"
        );
      }
      router.refresh();
    });
  }

  function handleBulkDuplicate() {
    startTransition(async () => {
      const results = await Promise.all(
        selected.map((q) => duplicateQuotation(workspace.id, q.id))
      );
      const failed = results.filter((r) => r.error).length;
      const succeeded = results.length - failed;
      toast(
        failed > 0
          ? `Duplicated ${succeeded}, ${failed} failed`
          : `Duplicated ${succeeded} quotation${succeeded === 1 ? "" : "s"}`,
        failed > 0 ? "error" : "success"
      );
      clearSelection();
      router.refresh();
    });
  }

  function handleBulkSend() {
    const sendable = selected.filter(
      (q) => q.status === "draft" || q.status === "revision_requested"
    );
    const skipped = selected.length - sendable.length;

    startTransition(async () => {
      const results = await Promise.all(
        sendable.map((q) => updateQuotationStatus(workspace.id, q.id, "sent"))
      );
      const failed = results.filter((r) => r.error).length;
      const sent = results.length - failed;
      const parts = [`${sent} sent`];
      if (skipped > 0) parts.push(`${skipped} already sent`);
      if (failed > 0) parts.push(`${failed} failed`);
      toast(parts.join(", "), failed > 0 ? "error" : "success");
      clearSelection();
      router.refresh();
    });
  }

  function handleBulkExportPdf() {
    selected.forEach((q, index) => {
      setTimeout(() => {
        window.open(
          `/${workspace.slug}/quotations/${q.id}?autoprint=1`,
          "_blank",
          "noopener,noreferrer"
        );
      }, index * 400);
    });
    clearSelection();
  }

  const bulkActions: BulkAction[] = [
    { label: "Export PDF", icon: Download, onClick: handleBulkExportPdf },
    { label: "Duplicate", icon: Copy, onClick: handleBulkDuplicate },
    { label: "Send", icon: Send, onClick: handleBulkSend },
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
          placeholder="Search number, title, client, company…"
        />
        <div className="flex flex-wrap items-center gap-2">
          <ViewToggle value={view} onChange={(v) => setParams({ view: v === "table" ? null : v })} />
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
        tabs={STATUS_TABS}
        value={status}
        onValueChange={(v) =>
          setParams({ status: v === "all" ? null : v, page: null })
        }
      />

      {optimisticQuotations.length === 0 ? (
        <ListEmpty message="No quotations match your filters." />
      ) : view === "table" ? (
        <QuotationTable
          quotations={optimisticQuotations}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          sorting={sorting}
          onSortingChange={onSortingChange}
        />
      ) : (
        <QuotationKanbanBoard
          quotations={optimisticQuotations}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
        />
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        count={count}
        noun="quotation"
        onPageChange={(p) => setParams({ page: String(p) })}
      />

      <BulkActionToolbar
        count={selected.length}
        noun="quotation"
        actions={bulkActions}
        onClear={clearSelection}
      />
    </div>
  );
}
