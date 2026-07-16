"use client";

import { useTransition, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Copy,
  GitBranch,
  Hash,
  MoreHorizontal,
  Pencil,
  Send,
  Link2,
  ExternalLink,
  Download,
  Printer,
  CheckCircle2,
  XCircle,
  Ban,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/shared/status-badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { useConfirm } from "@/providers/confirm-provider";
import {
  deleteQuotation,
  duplicateQuotation,
  createQuotationVersion,
  updateQuotationStatus,
} from "@/features/quotations/actions";
import { isEditableStatus } from "@/features/quotations/helpers";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { QuotationWithClient } from "@/features/quotations/types";

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
  const confirm = useConfirm();

  const href = `/${workspace.slug}/quotations/${quotation.id}`;
  const editable = isEditableStatus(quotation.status);
  const portalUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/portal/quotations/${quotation.share_token}`;

  // Quick Actions is context-aware: which status-transition items appear
  // depends entirely on the quotation's current status, mirroring the
  // exact same transitions QuotationStatusActions already exposes on the
  // detail page — this menu is a faster path to them, not a new set of
  // rules.
  const canSend = quotation.status === "draft" || quotation.status === "revision_requested";
  const canApproveOrReject = quotation.status === "viewed";
  const canCancel =
    quotation.status === "sent" ||
    quotation.status === "viewed" ||
    quotation.status === "revision_requested";
  const canDelete = quotation.status === "draft" || quotation.status === "cancelled";

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

  function transition(status: Parameters<typeof updateQuotationStatus>[2]) {
    startTransition(async () => {
      const result = await updateQuotationStatus(workspace.id, quotation.id, status);
      if (result.error) return toast(result.error, "error");
      toast("Quotation status updated", "success");
      router.refresh();
    });
  }

  async function handleSend() {
    const ok = await confirm({
      title: "Send quotation?",
      description: `This will send ${quotation.quotation_number} to the client via their portal link.`,
      confirmLabel: "Send",
    });
    if (ok) transition("sent");
  }

  async function handleApprove() {
    const ok = await confirm({
      title: "Approve quotation?",
      description: `Mark ${quotation.quotation_number} as approved. You'll then be able to generate a draft invoice.`,
      confirmLabel: "Approve",
    });
    if (ok) transition("approved");
  }

  async function handleReject() {
    const ok = await confirm({
      title: "Reject quotation?",
      description: `Mark ${quotation.quotation_number} as rejected.`,
      confirmLabel: "Reject",
    });
    if (ok) transition("rejected");
  }

  async function handleCancel() {
    const ok = await confirm({
      title: "Cancel quotation?",
      description: `This will cancel ${quotation.quotation_number}. This cannot be undone.`,
      confirmLabel: "Cancel Quotation",
      destructive: true,
    });
    if (ok) transition("cancelled");
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete ${quotation.quotation_number}?`,
      description: "It will move to trash.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteQuotation(workspace.id, quotation.id);
      if (result.error) return toast(result.error, "error");
      toast("Quotation deleted", "success");
      router.refresh();
    });
  }

  function handleCopyPortalLink() {
    navigator.clipboard.writeText(portalUrl);
    toast("Portal link copied", "success");
  }

  function handleOpenPortal() {
    window.open(portalUrl, "_blank", "noopener,noreferrer");
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
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Document</DropdownMenuLabel>
              {editable && (
                <DropdownMenuItem onClick={() => router.push(`${href}/edit`)}>
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
                Duplicate as Draft
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleNewVersion}>
                <GitBranch className="mr-2 h-4 w-4" />
                Create Revision
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Client</DropdownMenuLabel>
              {canSend && (
                <DropdownMenuItem onClick={handleSend}>
                  <Send className="mr-2 h-4 w-4" />
                  Send to Client
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleCopyPortalLink}>
                <Link2 className="mr-2 h-4 w-4" />
                Copy Portal Link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleOpenPortal}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Client Portal
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`${href}?autoprint=1`)}>
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`${href}?autoprint=1`)}>
                <Printer className="mr-2 h-4 w-4" />
                Print
              </DropdownMenuItem>

              {(canApproveOrReject || canCancel) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Status</DropdownMenuLabel>
                  {canApproveOrReject && (
                    <DropdownMenuItem onClick={handleApprove}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Mark Approved
                    </DropdownMenuItem>
                  )}
                  {canApproveOrReject && (
                    <DropdownMenuItem onClick={handleReject}>
                      <XCircle className="mr-2 h-4 w-4" />
                      Mark Rejected
                    </DropdownMenuItem>
                  )}
                  {canCancel && (
                    <DropdownMenuItem
                      onClick={handleCancel}
                      className="text-destructive focus:text-destructive"
                    >
                      <Ban className="mr-2 h-4 w-4" />
                      Cancel Quotation
                    </DropdownMenuItem>
                  )}
                </>
              )}

              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {quotation.status === "draft" ? "Delete Draft" : "Delete"}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <span className="text-xl font-semibold tabular-nums tracking-tight">
          {formatCurrency(quotation.total, quotation.currency)}
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
