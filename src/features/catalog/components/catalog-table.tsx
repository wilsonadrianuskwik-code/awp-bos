"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { CatalogRowActions } from "@/features/catalog/components/catalog-row-actions";
import { CatalogStatusToggle } from "@/features/catalog/components/catalog-status-toggle";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { CatalogItem, ItemType } from "@/features/catalog/types";
import type { LineItemCategory } from "@/features/line-items/types";

const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  product: "Product",
  service: "Service",
};

const CATEGORY_LABEL: Record<LineItemCategory, string> = {
  package: "Package",
  add_on: "Add-on",
  per_unit: "Per-unit",
};

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type CatalogTableProps = {
  items: CatalogItem[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
};

export function CatalogTable({
  items,
  selectedIds,
  onSelectedIdsChange,
}: CatalogTableProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();

  const columns: ColumnDef<CatalogItem, unknown>[] = [
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{row.original.name}</p>
          {row.original.description && (
            <p className="truncate text-xs text-muted-foreground">
              {row.original.description}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "sku",
      header: "SKU",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.sku ?? "—"}
        </span>
      ),
    },
    {
      id: "item_type",
      header: "Type",
      cell: ({ row }) => (
        <Badge variant="secondary">{ITEM_TYPE_LABEL[row.original.item_type]}</Badge>
      ),
    },
    {
      id: "default_category",
      header: "Category",
      cell: ({ row }) => (
        <span className="text-[13px] text-muted-foreground">
          {CATEGORY_LABEL[row.original.default_category]}
        </span>
      ),
    },
    {
      id: "default_unit_price",
      header: "Price",
      accessorFn: (row) => row.default_unit_price,
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-[13px] font-medium tabular-nums">
          {formatCurrency(row.original.default_unit_price, row.original.currency)}
          {row.original.default_unit && (
            <span className="ml-1 font-normal text-muted-foreground">
              / {row.original.default_unit}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "is_active",
      header: "Status",
      cell: ({ row }) => <CatalogStatusToggle item={row.original} />,
    },
    {
      id: "created_at",
      header: "Created",
      accessorFn: (row) => row.created_at,
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-[13px] tabular-nums text-muted-foreground">
          {formatDate(row.original.created_at)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
          <CatalogRowActions item={row.original} />
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={items}
      onRowClick={(item) => router.push(`/${workspace.slug}/catalog/${item.id}`)}
      selection={{
        selectedIds,
        onSelectedIdsChange,
        getId: (item) => item.id,
      }}
    />
  );
}
