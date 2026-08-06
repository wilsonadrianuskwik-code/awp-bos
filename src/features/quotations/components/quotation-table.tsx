"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef, OnChangeFn, SortingState } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { QuotationRowActions } from "@/features/quotations/components/quotation-row-actions";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { QuotationWithClient } from "@/features/quotations/types";

function formatDate(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type QuotationTableProps = {
  quotations: QuotationWithClient[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
};

export function QuotationTable({
  quotations,
  selectedIds,
  onSelectedIdsChange,
  sorting,
  onSortingChange,
}: QuotationTableProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();

  const columns: ColumnDef<QuotationWithClient, unknown>[] = [
    {
      id: "internal_id",
      meta: { className: "hidden xl:table-cell" },
      header: "Internal ID",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.internal_id ?? "—"}
        </span>
      ),
    },
    {
      id: "quotation_number",
      header: "Quotation Number",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs">{row.original.quotation_number}</span>
          {row.original.version > 1 && (
            <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
              V{row.original.version}
            </span>
          )}
        </div>
      ),
    },
    {
      id: "customer",
      header: "Customer",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">
            {row.original.client?.name ?? "Deleted client"}
          </p>
          {row.original.client?.company && (
            <p className="truncate text-xs text-muted-foreground">
              {row.original.client.company}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "project",
      meta: { className: "hidden lg:table-cell" },
      header: "Project",
      cell: ({ row }) => (
        <span className="truncate text-[13px]">
          {row.original.project ? row.original.project.code : "—"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "created_at",
      meta: { className: "hidden xl:table-cell" },
      header: "Created Date",
      accessorFn: (row) => row.created_at,
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-[13px] tabular-nums text-muted-foreground">
          {formatDate(row.original.created_at)}
        </span>
      ),
    },
    {
      id: "expiry_date",
      meta: { className: "hidden md:table-cell" },
      header: "Valid Until",
      accessorFn: (row) => row.expiry_date,
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-[13px] tabular-nums text-muted-foreground">
          {formatDate(row.original.expiry_date)}
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
      id: "converted_invoice",
      meta: { className: "hidden xl:table-cell" },
      header: "Converted Invoice",
      cell: ({ row }) =>
        row.original.converted_invoice ? (
          <Link
            href={`/${workspace.slug}/invoices/${row.original.converted_invoice.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-xs text-primary hover:underline"
          >
            {row.original.converted_invoice.invoice_number}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
          <QuotationRowActions quotation={row.original} />
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      getRowStatus={(quotation) => quotation.status}
      data={quotations}
      onRowClick={(quotation) =>
        router.push(`/${workspace.slug}/quotations/${quotation.id}`)
      }
      selection={{
        selectedIds,
        onSelectedIdsChange,
        getId: (quotation) => quotation.id,
      }}
      sorting={sorting}
      onSortingChange={onSortingChange}
    />
  );
}
