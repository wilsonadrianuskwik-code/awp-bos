"use client";

import { useTransition, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Hash, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/shared/status-badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { useConfirm } from "@/providers/confirm-provider";
import { deleteInvoice } from "@/features/invoices/actions";
import { getPaymentProgress } from "@/features/invoices/helpers";
import { formatCurrency } from "@/lib/utils/format-currency";
import { getOverdueDays } from "@/lib/utils/date";
import type { InvoiceWithClient } from "@/features/invoices/types";

function formatDate(date: string | null) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type InvoiceCardProps = {
  invoice: InvoiceWithClient;
};

export function InvoiceCard({ invoice }: InvoiceCardProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();

  const href = `/${workspace.slug}/invoices/${invoice.id}`;
  const editable = invoice.status === "draft";
  const progress = getPaymentProgress(invoice.amount_paid, invoice.total);

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete ${invoice.invoice_number}?`,
      description: "It will move to trash.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteInvoice(workspace.id, invoice.id);
      if (result.error) return toast(result.error, "error");
      toast("Invoice deleted", "success");
      router.refresh();
    });
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className="group relative flex cursor-pointer flex-col rounded-lg border bg-card p-5 shadow-2xs outline-none transition-all duration-150 hover:border-primary/40 hover:shadow-md focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/30"
      onClick={() => router.push(href)}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter") router.push(href);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="font-mono text-xs text-muted-foreground">
            {invoice.invoice_number}
          </span>
          <h3 className="mt-1 truncate text-sm font-semibold">
            {invoice.title || invoice.client.name}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            {invoice.client.name}
            {invoice.client.company ? ` · ${invoice.client.company}` : ""}
          </p>
        </div>

        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                disabled={isPending}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {editable && (
                <DropdownMenuItem onClick={() => router.push(`${href}/edit`)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => {
                  navigator.clipboard.writeText(invoice.invoice_number);
                  toast("Invoice number copied", "success");
                }}
              >
                <Hash className="mr-2 h-4 w-4" />
                Copy Number
              </DropdownMenuItem>
              {editable && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Outstanding Balance
          </p>
          <span className="text-2xl font-semibold tabular-nums tracking-tight">
            {formatCurrency(invoice.amount_due, invoice.currency)}
          </span>
        </div>
        <StatusBadge
          status={invoice.status}
          label={
            invoice.status === "overdue" && invoice.due_date
              ? `Overdue • ${getOverdueDays(invoice.due_date)}d`
              : undefined
          }
        />
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span>Total {formatCurrency(invoice.total, invoice.currency)}</span>
        <span>Paid {formatCurrency(invoice.amount_paid, invoice.currency)}</span>
      </div>

      {invoice.status === "partial" && (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-amber-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-3 border-t pt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {formatDate(invoice.issue_date)}
        </span>
        {invoice.due_date && <span>Due {formatDate(invoice.due_date)}</span>}
      </div>
    </div>
  );
}
