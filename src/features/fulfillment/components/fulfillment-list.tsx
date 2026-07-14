"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { FulfillmentProgress } from "@/features/fulfillment/components/fulfillment-progress";
import { FULFILLMENT_STATUSES } from "@/features/fulfillment/types";
import type { FulfillmentItemWithProgress } from "@/features/fulfillment/types";

const STATUS_TABS = [
  { value: "all", label: "All" },
  ...FULFILLMENT_STATUSES.map((s) => ({
    value: s,
    label: s.replace(/_/g, " "),
  })),
] as const;

const PAGE_SIZE = 25;

type FulfillmentListProps = {
  items: FulfillmentItemWithProgress[];
  totalCount: number;
};

export function FulfillmentList({ items, totalCount }: FulfillmentListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspace } = useWorkspace();

  const status = searchParams.get("status") ?? "all";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const columns: ColumnDef<FulfillmentItemWithProgress, unknown>[] = [
    {
      id: "client",
      header: "Client",
      cell: ({ row }) => (
        <Link
          href={`/${workspace.slug}/clients/${row.original.client_id}`}
          className="text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {row.original.client_name}
        </Link>
      ),
    },
    {
      id: "invoice",
      header: "Invoice",
      cell: ({ row }) => (
        <Link
          href={`/${workspace.slug}/invoices/${row.original.invoice_id}`}
          className="text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {row.original.invoice_number}
        </Link>
      ),
    },
    {
      accessorKey: "description",
      header: "Item",
      cell: ({ row }) => (
        <span className="line-clamp-1 max-w-64">{row.original.description}</span>
      ),
    },
    {
      id: "progress",
      header: "Progress",
      cell: ({ row }) => (
        <div className="min-w-48">
          <FulfillmentProgress
            purchased={row.original.purchased}
            delivered={row.original.delivered}
            remaining={row.original.remaining}
            progressPercent={row.original.progress_percent}
            isOverDelivered={row.original.is_over_delivered}
            unitLabel={row.original.unit}
          />
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() =>
              setParams({ status: tab.value === "all" ? null : tab.value, page: null })
            }
            className={
              status === tab.value
                ? "shrink-0 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium capitalize text-background"
                : "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium capitalize text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          No fulfillment trackers match your filters.
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={items}
          onRowClick={(item) =>
            router.push(`/${workspace.slug}/fulfillment/${item.id}`)
          }
        />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · {totalCount} tracker
            {totalCount === 1 ? "" : "s"}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setParams({ page: String(page - 1) })}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setParams({ page: String(page + 1) })}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
