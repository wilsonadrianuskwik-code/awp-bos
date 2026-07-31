"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef, OnChangeFn, SortingState } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { ProformaInvoiceWithClient } from "@/features/proforma-invoices/types";
import { formatDate } from "@/lib/utils/date";

type ProformaInvoiceTableProps = {
  proformaInvoices: ProformaInvoiceWithClient[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
};

export function ProformaInvoiceTable({
  proformaInvoices,
  selectedIds,
  onSelectedIdsChange,
  sorting,
  onSortingChange,
}: ProformaInvoiceTableProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();

  // Only `total` is marked sortable: it's the one column here that both
  // (a) the page's server query actually supports sorting by (SORT_FIELDS
  // is created_at/total/expiry_date) and (b) is actually shown as a
  // column — created_at and expiry_date aren't displayed in this table at
  // all, so there's nothing to attach a header click to for those; they're
  // still reachable via the sort dropdown above the table. The other
  // columns use `id` rather than `accessorKey` specifically so tanstack
  // doesn't default them sortable — a header click that can't tell the
  // server how to re-sort would just fall back to the old page-scoped
  // client sort this whole change is meant to remove.
  const columns: ColumnDef<ProformaInvoiceWithClient, unknown>[] = [
    {
      id: "pi_number",
      header: "Number",
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.pi_number}</span>
      ),
    },
    {
      id: "title",
      header: "Title",
      cell: ({ row }) => row.original.title || "—",
    },
    {
      id: "client",
      header: "Client",
      cell: ({ row }) => row.original.client?.name ?? "Deleted client",
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "total",
      header: "Total",
      accessorFn: (row) => row.total,
      enableSorting: true,
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatCurrency(row.original.total)}
        </span>
      ),
    },
    {
      id: "issue_date",
      header: "Issue Date",
      cell: ({ row }) =>
        formatDate(row.original.issue_date),
    },
  ];

  return (
    <DataTable
      columns={columns}
      getRowStatus={(pi) => pi.status}
      data={proformaInvoices}
      onRowClick={(pi) =>
        router.push(`/${workspace.slug}/proforma-invoices/${pi.id}`)
      }
      selection={{
        selectedIds,
        onSelectedIdsChange,
        getId: (pi) => pi.id,
      }}
      sorting={sorting}
      onSortingChange={onSortingChange}
    />
  );
}
