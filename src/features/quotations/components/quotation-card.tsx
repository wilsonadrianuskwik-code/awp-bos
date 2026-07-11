"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Copy,
  GitBranch,
  Hash,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
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
import {
  deleteQuotation,
  duplicateQuotation,
  createQuotationVersion,
} from "@/features/quotations/actions";
import { isEditableStatus } from "@/features/quotations/helpers";
import type { QuotationWithClient } from "@/features/quotations/types";

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(date: string | null) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type QuotationCardProps = {
  quotation: QuotationWithClient;
};

export function QuotationCard({ quotation }: QuotationCardProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();

  const href = `/${workspace.slug}/quotations/${quotation.id}`;
  const editable = isEditableStatus(quotation.status);

  function handleDuplicate() {
    startTransition(async () => {
      const result = await duplicateQuotation(workspace.id, quotation.id);
      if (result.error) return toast(result.error, "error");
      toast(`Duplicated as ${result.data!.quotation_number}`, "success");
      router.push(`/${workspace.slug}/quotations/${result.data!.id}`);
    });
  }

  function handleNewVersion() {
    startTransition(async () => {
      const result = await createQuotationVersion(workspace.id, quotation.id);
      if (result.error) return toast(result.error, "error");
      toast(`Created V${result.data!.version}`, "success");
      router.push(`/${workspace.slug}/quotations/${result.data!.id}`);
    });
  }

  function handleDelete() {
    if (!confirm(`Delete ${quotation.quotation_number}? It will move to trash.`))
      return;
    startTransition(async () => {
      const result = await deleteQuotation(workspace.id, quotation.id);
      if (result.error) return toast(result.error, "error");
      toast("Quotation deleted", "success");
      router.refresh();
    });
  }

  return (
    <div
      className="group relative flex cursor-pointer flex-col rounded-xl border bg-card p-5 transition-all duration-150 hover:border-foreground/20 hover:shadow-md"
      onClick={() => router.push(href)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {quotation.quotation_number}
            </span>
            {quotation.version > 1 && (
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
                V{quotation.version}
              </span>
            )}
          </div>
          <h3 className="mt-1 truncate text-sm font-semibold">
            {quotation.title || quotation.client.name}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            {quotation.client.name}
            {quotation.client.company ? ` · ${quotation.client.company}` : ""}
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
                <DropdownMenuItem
                  onClick={() => router.push(`${href}/edit`)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => {
                  navigator.clipboard.writeText(quotation.quotation_number);
                  toast("Quotation number copied", "success");
                }}
              >
                <Hash className="mr-2 h-4 w-4" />
                Copy Number
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDuplicate}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate as New Draft
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleNewVersion}>
                <GitBranch className="mr-2 h-4 w-4" />
                New Version
              </DropdownMenuItem>
              {(quotation.status === "draft" ||
                quotation.status === "cancelled") && (
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
        <span className="text-xl font-semibold tabular-nums tracking-tight">
          {formatMoney(quotation.total, quotation.currency)}
        </span>
        <StatusBadge status={quotation.status} />
      </div>

      <div className="mt-3 flex items-center gap-3 border-t pt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {formatDate(quotation.issue_date)}
        </span>
        {quotation.expiry_date && (
          <span>Expires {formatDate(quotation.expiry_date)}</span>
        )}
      </div>
    </div>
  );
}
