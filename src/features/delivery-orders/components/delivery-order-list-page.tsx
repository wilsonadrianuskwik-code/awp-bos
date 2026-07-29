"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import type { DeliveryOrderWithRelations } from "@/features/delivery-orders/types";
import type { ColumnDef } from "@tanstack/react-table";

export function DeliveryOrderListPage({
  deliveryOrders,
  workspaceSlug,
}: {
  deliveryOrders: DeliveryOrderWithRelations[];
  workspaceSlug: string;
}) {
  const router = useRouter();

  if (deliveryOrders.length === 0) {
    return (
      <EmptyState
        icon={PackageCheck}
        title="No delivery orders yet"
        description="Delivery orders are usually created from an invoice, but you can also create one directly."
        action={
          <Button asChild size="sm">
            <Link href={`/${workspaceSlug}/delivery-orders/new`}>New Delivery Order</Link>
          </Button>
        }
      />
    );
  }

  const columns: ColumnDef<DeliveryOrderWithRelations>[] = [
    {
      accessorKey: "do_number",
      header: "DO Number",
      cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.do_number}</span>,
    },
    { accessorKey: "invoice.invoice_number", header: "Invoice", cell: ({ row }) => row.original.invoice?.invoice_number ?? "—" },
    { accessorKey: "client.name", header: "Client", cell: ({ row }) => row.original.client?.name ?? "—" },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { accessorKey: "delivery_date", header: "Delivery Date", cell: ({ row }) => row.original.delivery_date ?? "—" },
  ];

  return (
    <DataTable
      columns={columns}
      getRowStatus={(deliveryOrder) => deliveryOrder.status}
      data={deliveryOrders}
      onRowClick={(row) => router.push(`/${workspaceSlug}/delivery-orders/${row.id}`)}
    />
  );
}
