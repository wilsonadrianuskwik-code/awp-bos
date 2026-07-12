"use client";

import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/format-currency";
import { useWorkspace } from "@/providers/workspace-provider";
import type { CatalogItem } from "@/features/catalog/types";

const ITEM_TYPE_LABEL: Record<CatalogItem["item_type"], string> = {
  product: "Product",
  service: "Service",
};

const columns: ColumnDef<CatalogItem, unknown>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <span className="font-medium">{row.getValue("name")}</span>
    ),
  },
  {
    accessorKey: "item_type",
    header: "Type",
    cell: ({ row }) => (
      <Badge variant="secondary">
        {ITEM_TYPE_LABEL[row.getValue("item_type") as CatalogItem["item_type"]]}
      </Badge>
    ),
  },
  {
    accessorKey: "sku",
    header: "SKU",
    cell: ({ row }) => row.getValue("sku") || "-",
  },
  {
    accessorKey: "default_unit_price",
    header: "Default Price",
    cell: ({ row }) =>
      formatCurrency(
        row.getValue("default_unit_price") as number,
        row.original.currency
      ),
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

type CatalogListProps = {
  items: CatalogItem[];
};

export function CatalogList({ items }: CatalogListProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();

  return (
    <DataTable
      columns={columns}
      data={items}
      onRowClick={(item) => router.push(`/${workspace.slug}/catalog/${item.id}`)}
    />
  );
}
