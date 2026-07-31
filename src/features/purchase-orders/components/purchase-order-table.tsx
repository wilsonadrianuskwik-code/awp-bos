"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef, OnChangeFn, SortingState } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { PurchaseOrderRowActions } from "@/features/purchase-orders/components/purchase-order-row-actions";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { PurchaseOrderWithRelations } from "@/features/purchase-orders/types";

function formatDate(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type PurchaseOrderTableProps = {
  purchaseOrders: PurchaseOrderWithRelations[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
};

export function PurchaseOrderTable({
  purchaseOrders,
  selectedIds,
  onSelectedIdsChange,
  sorting,
  onSortingChange,
}: PurchaseOrderTableProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();

  const columns: ColumnDef<PurchaseOrderWithRelations, unknown>[] = [
    {
      id: "po_number",
      header: "PO Number",
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.po_number}</span>
      ),
    },
    {
      id: "supplier",
      header: "Supplier",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">
            {row.original.supplier?.name ?? "Deleted supplier"}
          </p>
          {row.original.supplier?.company && (
            <p className="truncate text-xs text-muted-foreground">
              {row.original.supplier.company}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "project",
      header: "Project",
      cell: ({ row }) => (
        <span className="truncate text-[13px]">
          {row.original.project ? `${row.original.project.code} · ${row.original.project.name}` : "—"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "issue_date",
      header: "Issue Date",
      accessorFn: (row) => row.issue_date,
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-[13px] tabular-nums text-muted-foreground">
          {formatDate(row.original.issue_date)}
        </span>
      ),
    },
    {
      id: "expected_date",
      header: "Expected Date",
      accessorFn: (row) => row.expected_date,
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-[13px] tabular-nums text-muted-foreground">
          {formatDate(row.original.expected_date)}
        </span>
      ),
    },
    {
      id: "total",
      header: "Total Amount",
      accessorFn: (row) => row.total,
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-[13px] font-medium tabular-nums">
          {formatCurrency(row.original.total)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
          <PurchaseOrderRowActions purchaseOrder={row.original} />
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      getRowStatus={(purchaseOrder) => purchaseOrder.status}
      data={purchaseOrders}
      onRowClick={(po) => router.push(`/${workspace.slug}/purchase-orders/${po.id}`)}
      selection={{
        selectedIds,
        onSelectedIdsChange,
        getId: (po) => po.id,
      }}
      sorting={sorting}
      onSortingChange={onSortingChange}
    />
  );
}
