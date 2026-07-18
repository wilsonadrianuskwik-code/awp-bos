"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
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
import type { QuotationWithClient } from "@/features/quotations/types";

type QuotationRowActionsProps = {
  quotation: QuotationWithClient;
};

// The quick-actions menu shared by the quotation card (Kanban) and the
// quotation table row — one menu, one set of rules, rendered from either
// surface instead of duplicated. Which items appear depends entirely on
// the quotation's current status, mirroring the exact transitions
// QuotationStatusActions already exposes on the detail page.
export function QuotationRowActions({ quotation }: QuotationRowActionsProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { workspace, can } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();

  const href = `/${workspace.slug}/quotations/${quotation.id}`;
  const editable = isEditableStatus(quotation.status);
  const portalUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/portal/quotations/${quotation.share_token}`;

  const canSend = quotation.status === "draft" || quotation.status === "revision_requested";
  const canApproveOrReject = quotation.status === "viewed";
  const canVoid =
    quotation.status === "sent" ||
    quotation.status === "viewed" ||
    quotation.status === "revision_requested";

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

  async function handleVoid() {
    const ok = await confirm({
      title: "Void quotation?",
      description: `This will cancel ${quotation.quotation_number}. This cannot be undone.`,
      confirmLabel: "Void Quotation",
      destructive: true,
    });
    if (ok) transition("cancelled");
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete this quotation?",
      description: "This action cannot be undone.",
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
          disabled={isPending}
          aria-label="More actions"
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

        {(canApproveOrReject || canVoid) && (
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
            {canVoid && (
              <DropdownMenuItem
                onClick={handleVoid}
                className="text-destructive focus:text-destructive"
              >
                <Ban className="mr-2 h-4 w-4" />
                Void Quotation
              </DropdownMenuItem>
            )}
          </>
        )}

        {can("staff") && (
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
  );
}
