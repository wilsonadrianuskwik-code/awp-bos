"use client";

import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { Lead } from "@/features/leads/types";

const columns: ColumnDef<Lead, unknown>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <span className="font-medium">{row.getValue("name")}</span>
    ),
  },
  {
    accessorKey: "company",
    header: "Company",
    cell: ({ row }) => row.getValue("company") || "-",
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => row.getValue("email") || "-",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.getValue("status")} />,
  },
  {
    accessorKey: "source",
    header: "Source",
    cell: ({ row }) => {
      const source = row.getValue("source") as string | null;
      return source ? source.replace(/_/g, " ") : "-";
    },
  },
  {
    accessorKey: "expected_value",
    header: "Expected Value",
    cell: ({ row }) => {
      const value = row.getValue("expected_value") as number | null;
      return value != null
        ? formatCurrency(value, row.original.expected_currency)
        : "-";
    },
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => {
      const date = new Date(row.getValue("created_at") as string);
      return date.toLocaleDateString();
    },
  },
];

type LeadListProps = {
  leads: Lead[];
};

export function LeadList({ leads }: LeadListProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();

  return (
    <DataTable
      columns={columns}
      data={leads}
      onRowClick={(lead) => router.push(`/${workspace.slug}/leads/${lead.id}`)}
    />
  );
}
