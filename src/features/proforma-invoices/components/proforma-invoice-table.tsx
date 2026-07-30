"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
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
};

export function ProformaInvoiceTable({
  proformaInvoices,
  selectedIds,
  onSelectedIdsChange,
}: ProformaInvoiceTableProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();

  const columns: ColumnDef<ProformaInvoiceWithClient, unknown>[] = [
    {
      accessorKey: "pi_number",
      header: "Number",
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.pi_number}</span>
      ),
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => row.original.title || "—",
    },
    {
      id: "client",
      header: "Client",
      cell: ({ row }) => row.original.client?.name ?? "Deleted client",
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "total",
      header: "Total",
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatCurrency(row.original.total)}
        </span>
      ),
    },
    {
      accessorKey: "issue_date",
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
    />
  );
}
