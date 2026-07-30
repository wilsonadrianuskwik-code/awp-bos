"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { InvoiceRowActions } from "@/features/invoices/components/invoice-row-actions";
import { formatCurrency } from "@/lib/utils/format-currency";
import { getOverdueDays } from "@/lib/utils/date";
import type { InvoiceWithClient } from "@/features/invoices/types";

function formatDate(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type InvoiceTableProps = {
  invoices: InvoiceWithClient[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
};

export function InvoiceTable({ invoices, selectedIds, onSelectedIdsChange }: InvoiceTableProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();

  const columns: ColumnDef<InvoiceWithClient, unknown>[] = [
    {
      id: "internal_id",
      header: "Internal ID",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.internal_id ?? "—"}
        </span>
      ),
    },
    {
      id: "invoice_number",
      header: "Invoice Number",
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.invoice_number}</span>
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
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          label={
            row.original.status === "overdue" && row.original.due_date
              ? `Overdue • ${getOverdueDays(row.original.due_date)}d`
              : undefined
          }
        />
      ),
    },
    {
      id: "created_at",
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
      id: "due_date",
      header: "Due Date",
      accessorFn: (row) => row.due_date,
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-[13px] tabular-nums text-muted-foreground">
          {formatDate(row.original.due_date)}
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
      id: "source_quotation",
      header: "Source Quotation",
      cell: ({ row }) =>
        row.original.source_quotation ? (
          <Link
            href={`/${workspace.slug}/quotations/${row.original.source_quotation.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-xs text-primary hover:underline"
          >
            {row.original.source_quotation.quotation_number}
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
          <InvoiceRowActions invoice={row.original} />
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      getRowStatus={(invoice) => invoice.status}
      data={invoices}
      onRowClick={(invoice) => router.push(`/${workspace.slug}/invoices/${invoice.id}`)}
      selection={{
        selectedIds,
        onSelectedIdsChange,
        getId: (invoice) => invoice.id,
      }}
    />
  );
}
