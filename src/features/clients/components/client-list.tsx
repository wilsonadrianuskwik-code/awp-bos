"use client";

import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { useWorkspace } from "@/providers/workspace-provider";
import type { Client } from "@/features/clients/types";

const columns: ColumnDef<Client, unknown>[] = [
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
    accessorKey: "phone",
    header: "Phone",
    cell: ({ row }) => row.getValue("phone") || "-",
  },
  {
    accessorKey: "payment_terms",
    header: "Payment Terms",
    cell: ({ row }) => `${row.getValue("payment_terms")} days`,
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

type ClientListProps = {
  clients: Client[];
};

export function ClientList({ clients }: ClientListProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();

  return (
    <DataTable
      columns={columns}
      data={clients}
      onRowClick={(client) =>
        router.push(`/${workspace.slug}/clients/${client.id}`)
      }
    />
  );
}
