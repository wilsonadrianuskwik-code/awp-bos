"use client";

import { useCallback, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
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
import { ProformaInvoiceTable } from "@/features/proforma-invoices/components/proforma-invoice-table";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { useConfirm } from "@/providers/confirm-provider";
import { deleteProformaInvoice } from "@/features/proforma-invoices/actions";
import type { ProformaInvoiceWithClient } from "@/features/proforma-invoices/types";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
  { value: "converted", label: "Converted" },
] as const;

const SORT_OPTIONS = [
  { value: "created_at:desc", label: "Newest first" },
  { value: "created_at:asc", label: "Oldest first" },
  { value: "total:desc", label: "Highest value" },
  { value: "total:asc", label: "Lowest value" },
  { value: "expiry_date:asc", label: "Expiring soon" },
] as const;

const PAGE_SIZE = 20;

type ProformaInvoiceListPageProps = {
  proformaInvoices: ProformaInvoiceWithClient[];
  count: number;
};

export function ProformaInvoiceListPage({
  proformaInvoices,
  count,
}: ProformaInvoiceListPageProps) {
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

  const [search, setSearch] = useState(urlSearch);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [optimisticList, removeOptimistic] = useOptimistic(
    proformaInvoices,
    (state, idsToRemove: Set<string>) => state.filter((p) => !idsToRemove.has(p.id))
  );

  const [prevList, setPrevList] = useState(proformaInvoices);
  if (proformaInvoices !== prevList) {
    setPrevList(proformaInvoices);
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
  const selected = optimisticList.filter((p) => selectedIds.has(p.id));

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    const ok = await confirm({
      title: `Delete ${selected.length} proforma invoice${selected.length === 1 ? "" : "s"}?`,
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    const idsToDelete = new Set(selected.map((p) => p.id));
    const toDelete = selected;
    clearSelection();

    startTransition(async () => {
      removeOptimistic(idsToDelete);
      const results = await Promise.all(
        toDelete.map((p) => deleteProformaInvoice(workspace.id, p.id))
      );
      const failed = results.filter((r) => r.error).length;
      const succeeded = results.length - failed;
      toast(
        failed > 0
          ? `Deleted ${succeeded}, ${failed} failed`
          : `Deleted ${succeeded} proforma invoice${succeeded === 1 ? "" : "s"}`,
        failed > 0 ? "error" : "success"
      );
      router.refresh();
    });
  }

  const bulkActions: BulkAction[] = [];
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
          placeholder="Search number, title, client…"
        />
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

      <StatusTabs
        tabs={STATUS_TABS}
        value={status}
        onValueChange={(v) => setParams({ status: v === "all" ? null : v, page: null })}
      />

      {optimisticList.length === 0 ? (
        <ListEmpty message="No proforma invoices match your filters." />
      ) : (
        <ProformaInvoiceTable
          proformaInvoices={optimisticList}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
        />
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        count={count}
        noun="proforma invoice"
        onPageChange={(p) => setParams({ page: String(p) })}
      />

      <BulkActionToolbar
        count={selected.length}
        noun="proforma invoice"
        actions={bulkActions}
        onClear={clearSelection}
      />
    </div>
  );
}
