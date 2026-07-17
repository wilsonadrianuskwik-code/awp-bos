"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
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
import { InvoiceTable } from "@/features/invoices/components/invoice-table";
import { InvoiceKanbanBoard } from "@/features/invoices/components/invoice-kanban-board";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { useConfirm } from "@/providers/confirm-provider";
import {
  deleteInvoice,
  duplicateInvoice,
  updateInvoiceStatus,
} from "@/features/invoices/actions";
import type { InvoiceWithClient } from "@/features/invoices/types";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "viewed", label: "Viewed" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "cancelled", label: "Cancelled" },
] as const;

const SORT_OPTIONS = [
  { value: "created_at:desc", label: "Newest first" },
  { value: "created_at:asc", label: "Oldest first" },
  { value: "total:desc", label: "Highest value" },
  { value: "total:asc", label: "Lowest value" },
  { value: "due_date:asc", label: "Due soon" },
] as const;

const PAGE_SIZE = 20;

type InvoiceListPageProps = {
  invoices: InvoiceWithClient[];
  count: number;
};

export function InvoiceListPage({ invoices, count }: InvoiceListPageProps) {
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

  // Selection is scoped to what's currently loaded — a fresh page load or
  // filter change invalidates it rather than pointing at rows that are no
  // longer visible. Adjusted during render (not an effect) per React's
  // "you might not need an effect" guidance for resetting state when a
  // prop changes.
  const [prevInvoices, setPrevInvoices] = useState(invoices);
  if (invoices !== prevInvoices) {
    setPrevInvoices(invoices);
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
  const selected = invoices.filter((i) => selectedIds.has(i.id));

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    const ok = await confirm({
      title: `Delete ${selected.length} invoice${selected.length === 1 ? "" : "s"}?`,
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    startTransition(async () => {
      const results = await Promise.all(
        selected.map((i) => deleteInvoice(workspace.id, i.id))
      );
      const failed = results.filter((r) => r.error).length;
      const succeeded = results.length - failed;
      toast(
        failed > 0
          ? `Deleted ${succeeded}, ${failed} failed`
          : `Deleted ${succeeded} invoice${succeeded === 1 ? "" : "s"}`,
        failed > 0 ? "error" : "success"
      );
      clearSelection();
      router.refresh();
    });
  }

  function handleBulkDuplicate() {
    startTransition(async () => {
      const results = await Promise.all(
        selected.map((i) => duplicateInvoice(workspace.id, i.id))
      );
      const failed = results.filter((r) => r.error).length;
      const succeeded = results.length - failed;
      toast(
        failed > 0
          ? `Duplicated ${succeeded}, ${failed} failed`
          : `Duplicated ${succeeded} invoice${succeeded === 1 ? "" : "s"}`,
        failed > 0 ? "error" : "success"
      );
      clearSelection();
      router.refresh();
    });
  }

  function handleBulkSend() {
    const draftsToSend = selected.filter((i) => i.status === "draft");
    const skipped = selected.length - draftsToSend.length;

    startTransition(async () => {
      const results = await Promise.all(
        draftsToSend.map((i) => updateInvoiceStatus(workspace.id, i.id, "sent"))
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
    selected.forEach((i, index) => {
      setTimeout(() => {
        window.open(
          `/${workspace.slug}/invoices/${i.id}?autoprint=1`,
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

      {invoices.length === 0 ? (
        <ListEmpty message="No invoices match your filters." />
      ) : view === "table" ? (
        <InvoiceTable
          invoices={invoices}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
        />
      ) : (
        <InvoiceKanbanBoard
          invoices={invoices}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
        />
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        count={count}
        noun="invoice"
        onPageChange={(p) => setParams({ page: String(p) })}
      />

      <BulkActionToolbar
        count={selected.length}
        noun="invoice"
        actions={bulkActions}
        onClear={clearSelection}
      />
    </div>
  );
}
