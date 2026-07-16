"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { SearchInput } from "@/components/shared/search-input";
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
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) =>
      row.getValue("is_active") ? (
        <Badge>Active</Badge>
      ) : (
        <Badge variant="secondary">Inactive</Badge>
      ),
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
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.name, item.sku, item.description].some((v) =>
        v?.toLowerCase().includes(q)
      )
    );
  }, [items, query]);

  return (
    <div className="space-y-4">
      <SearchInput value={query} onChange={setQuery} placeholder="Search products & services…" />
      <DataTable
        columns={columns}
        data={filtered}
        onRowClick={(item) => router.push(`/${workspace.slug}/catalog/${item.id}`)}
      />
    </div>
  );
}
