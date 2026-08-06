"use client";

import { useCallback, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
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
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { useConfirm } from "@/providers/confirm-provider";
import { deleteSupplier } from "@/features/suppliers/actions";
import type { Supplier } from "@/features/suppliers/types";
import { formatDate } from "@/lib/utils/date";

const SORT_OPTIONS = [
  { value: "created_at:desc", label: "Newest first" },
  { value: "created_at:asc", label: "Oldest first" },
  { value: "name:asc", label: "Name A-Z" },
  { value: "name:desc", label: "Name Z-A" },
] as const;

const PAGE_SIZE = 20;

const columns: ColumnDef<Supplier, unknown>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <span className="font-medium">{row.getValue("name")}</span>
    ),
  },
  {
    accessorKey: "company",
    meta: { className: "hidden lg:table-cell" },
    header: "Company",
    cell: ({ row }) => row.getValue("company") || "—",
  },
  {
    accessorKey: "email",
    meta: { className: "hidden md:table-cell" },
    header: "Email",
    cell: ({ row }) => row.getValue("email") || "—",
  },
  {
    accessorKey: "phone",
    meta: { className: "hidden xl:table-cell" },
    header: "Phone",
    cell: ({ row }) => row.getValue("phone") || "—",
  },
  {
    accessorKey: "payment_terms",
    meta: { className: "hidden xl:table-cell" },
    header: "Payment Terms",
    cell: ({ row }) => `${row.getValue("payment_terms")} days`,
  },
  {
    accessorKey: "created_at",
    meta: { className: "hidden lg:table-cell" },
    header: "Created",
    cell: ({ row }) => formatDate(row.getValue("created_at") as string),
  },
];

type SupplierListPageProps = {
  suppliers: Supplier[];
  count: number;
};

export function SupplierListPage({ suppliers, count }: SupplierListPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspace, can } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [, startTransition] = useTransition();

  const sort = searchParams.get("sort") ?? "created_at:desc";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const urlSearch = searchParams.get("q") ?? "";

  const [search, setSearch] = useState(urlSearch);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [optimisticSuppliers, removeOptimisticSuppliers] = useOptimistic(
    suppliers,
    (state, idsToRemove: Set<string>) => state.filter((s) => !idsToRemove.has(s.id))
  );

  const [prevSuppliers, setPrevSuppliers] = useState(suppliers);
  if (suppliers !== prevSuppliers) {
    setPrevSuppliers(suppliers);
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
  const selected = optimisticSuppliers.filter((s) => selectedIds.has(s.id));

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    const ok = await confirm({
      title: `Delete ${selected.length} supplier${selected.length === 1 ? "" : "s"}?`,
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    const idsToDelete = new Set(selected.map((s) => s.id));
    const toDelete = selected;
    clearSelection();

    startTransition(async () => {
      removeOptimisticSuppliers(idsToDelete);
      const results = await Promise.all(
        toDelete.map((s) => deleteSupplier(workspace.id, s.id))
      );
      const failed = results.filter((r) => r.error).length;
      const succeeded = results.length - failed;
      toast(
        failed > 0
          ? `Deleted ${succeeded}, ${failed} failed`
          : `Deleted ${succeeded} supplier${succeeded === 1 ? "" : "s"}`,
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
          placeholder="Search name, company, email, phone…"
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

      {optimisticSuppliers.length === 0 ? (
        <ListEmpty message="No suppliers match your filters." />
      ) : (
        <DataTable
          columns={columns}
          data={optimisticSuppliers}
          onRowClick={(supplier) => router.push(`/${workspace.slug}/suppliers/${supplier.id}`)}
          selection={
            can("staff")
              ? { selectedIds, onSelectedIdsChange: setSelectedIds, getId: (s) => s.id }
              : undefined
          }
        />
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        count={count}
        noun="supplier"
        onPageChange={(p) => setParams({ page: String(p) })}
      />

      <BulkActionToolbar
        count={selected.length}
        noun="supplier"
        actions={bulkActions}
        onClear={clearSelection}
      />
    </div>
  );
}
