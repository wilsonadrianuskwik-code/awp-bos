"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Hash,
  MoreHorizontal,
  Pencil,
  Copy,
  CreditCard,
  History,
  PackageCheck,
  Send,
  Link2,
  ExternalLink,
  Download,
  Printer,
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
import { RecordPaymentDialog } from "@/features/invoices/components/record-payment-dialog";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { useConfirm } from "@/providers/confirm-provider";
import {
  deleteInvoice,
  duplicateInvoice,
  updateInvoiceStatus,
} from "@/features/invoices/actions";
import type { InvoiceWithClient } from "@/features/invoices/types";

type InvoiceRowActionsProps = {
  invoice: InvoiceWithClient;
};

// The quick-actions menu shared by the invoice card (Kanban) and the
// invoice table row — one menu, one set of rules, rendered from either
// surface instead of duplicated. Which items appear depends entirely on
// the invoice's current status, mirroring the exact transitions
// InvoiceStatusActions already exposes on the detail page.
export function InvoiceRowActions({ invoice }: InvoiceRowActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();

  const href = `/${workspace.slug}/invoices/${invoice.id}`;
  const editable = invoice.status === "draft";
  const portalUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/portal/invoices/${invoice.share_token}`;

  const canSend = invoice.status === "draft";
  const canRecordPayment = ["sent", "viewed", "partial", "overdue"].includes(invoice.status);
  const canVoid = invoice.status === "sent" || invoice.status === "viewed";

  function handleDuplicate() {
    startTransition(async () => {
      const result = await duplicateInvoice(workspace.id, invoice.id);
      if (result.error) return toast(result.error, "error");
      toast(`Duplicated as ${result.data!.invoice_number}`, "success");
      router.push(`/${workspace.slug}/invoices/${result.data!.id}`);
    });
  }

  function transition(status: Parameters<typeof updateInvoiceStatus>[2]) {
    startTransition(async () => {
      const result = await updateInvoiceStatus(workspace.id, invoice.id, status);
      if (result.error) return toast(result.error, "error");
      toast("Invoice status updated", "success");
      router.refresh();
    });
  }

  async function handleSend() {
    const ok = await confirm({
      title: "Send invoice?",
      description: `This will send ${invoice.invoice_number} to the client via their portal link.`,
      confirmLabel: "Send",
    });
    if (ok) transition("sent");
  }

  async function handleVoid() {
    const ok = await confirm({
      title: "Void invoice?",
      description: `This will cancel ${invoice.invoice_number}. This cannot be undone.`,
      confirmLabel: "Void Invoice",
      destructive: true,
    });
    if (ok) transition("cancelled");
  }

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

  function handleCopyPortalLink() {
    navigator.clipboard.writeText(portalUrl);
    toast("Portal link copied", "success");
  }

  function handleOpenPortal() {
    window.open(portalUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <>
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
              navigator.clipboard.writeText(invoice.invoice_number);
              toast("Invoice number copied", "success");
            }}
          >
            <Hash className="mr-2 h-4 w-4" />
            Copy Number
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDuplicate}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Payment &amp; Fulfillment</DropdownMenuLabel>
          {canRecordPayment && (
            <DropdownMenuItem onClick={() => setRecordPaymentOpen(true)}>
              <CreditCard className="mr-2 h-4 w-4" />
              Record Payment
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => router.push(`${href}#payments`)}>
            <History className="mr-2 h-4 w-4" />
            View Payment History
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(`${href}#fulfillment`)}>
            <PackageCheck className="mr-2 h-4 w-4" />
            Open Fulfillment
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Client</DropdownMenuLabel>
          {canSend && (
            <DropdownMenuItem onClick={handleSend}>
              <Send className="mr-2 h-4 w-4" />
              Send Invoice
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

          {canVoid && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={handleVoid}
                className="text-destructive focus:text-destructive"
              >
                <Ban className="mr-2 h-4 w-4" />
                Void Invoice
              </DropdownMenuItem>
            </>
          )}

          {editable && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Draft
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sibling, not nested inside a clickable parent — Radix Dialog
          content portals out of the DOM, but React's synthetic events
          still bubble through the *declared* JSX tree. */}
      {canRecordPayment && (
        <RecordPaymentDialog
          open={recordPaymentOpen}
          onOpenChange={setRecordPaymentOpen}
          invoice={invoice}
        />
      )}
    </>
  );
}
