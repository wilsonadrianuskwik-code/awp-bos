"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRangePicker, type DateRange } from "@/components/ui/date-range-picker";
import { formatCurrency } from "@/lib/utils/format-currency";
import { useWorkspace } from "@/providers/workspace-provider";
import { PAYMENT_METHOD_LABEL } from "@/features/invoices/helpers";
import { PAYMENT_METHODS, type PaymentMethod } from "@/features/invoices/types";
import type { PaymentWithContext } from "@/features/payments/types";

const CURRENCIES = ["USD", "EUR", "GBP", "SGD", "MYR", "IDR", "AUD", "CAD"];

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type PaymentsListProps = {
  payments: PaymentWithContext[];
};

export function PaymentsList({ payments }: PaymentsListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspace } = useWorkspace();

  const urlSearch = searchParams.get("q") ?? "";
  const currency = searchParams.get("currency") ?? "all";
  const method = searchParams.get("method") ?? "all";
  const dateRange: DateRange = {
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
  };

  const [search, setSearch] = useState(urlSearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    if (search === urlSearch) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setParams({ q: search || null });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, urlSearch, setParams]);

  const columns: ColumnDef<PaymentWithContext, unknown>[] = [
    {
      accessorKey: "payment_number",
      header: "Payment #",
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.getValue("payment_number")}</span>
      ),
    },
    {
      accessorKey: "payment_date",
      header: "Date",
      cell: ({ row }) => formatDate(row.getValue("payment_date")),
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {formatCurrency(row.getValue("amount"), row.original.currency)}
        </span>
      ),
    },
    {
      accessorKey: "payment_method",
      header: "Method",
      cell: ({ row }) => (
        <Badge variant="secondary">
          {PAYMENT_METHOD_LABEL[row.getValue("payment_method") as PaymentMethod]}
        </Badge>
      ),
    },
    {
      id: "invoice",
      header: "Invoice",
      cell: ({ row }) => {
        const invoice = row.original.invoice;
        if (!invoice) return "-";
        return (
          <Link
            href={`/${workspace.slug}/invoices/${invoice.id}`}
            className="text-primary hover:underline"
          >
            {invoice.invoice_number}
          </Link>
        );
      },
    },
    {
      id: "client",
      header: "Client",
      cell: ({ row }) => {
        const client = row.original.invoice?.client;
        if (!client) return "-";
        return (
          <Link
            href={`/${workspace.slug}/clients/${client.id}`}
            className="text-primary hover:underline"
          >
            {client.name}
          </Link>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search payment #, invoice #, or client..."
            className="h-9 pl-9"
          />
        </div>

        <DateRangePicker
          value={dateRange}
          onChange={(range) =>
            setParams({ from: range.from || null, to: range.to || null })
          }
        />

        <Select
          value={currency}
          onValueChange={(v) => setParams({ currency: v === "all" ? null : v })}
        >
          <SelectTrigger className="h-9 w-full sm:w-36">
            <SelectValue placeholder="Currency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All currencies</SelectItem>
            {CURRENCIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={method}
          onValueChange={(v) => setParams({ method: v === "all" ? null : v })}
        >
          <SelectTrigger className="h-9 w-full sm:w-40">
            <SelectValue placeholder="Method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            {PAYMENT_METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {PAYMENT_METHOD_LABEL[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {payments.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          No payments match your filters.
        </div>
      ) : (
        <DataTable columns={columns} data={payments} />
      )}
    </div>
  );
}
