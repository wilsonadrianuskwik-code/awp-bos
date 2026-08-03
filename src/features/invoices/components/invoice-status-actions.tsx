"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, MoreHorizontal, Send, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { useConfirm } from "@/providers/confirm-provider";
import { deleteInvoice, updateInvoiceStatus } from "@/features/invoices/actions";
import type { Invoice, InvoiceStatus } from "@/features/invoices/types";

type InvoiceStatusActionsProps = {
  invoice: Invoice;
  onRecordPayment: () => void;
  /**
   * Page-level items appended to this component's overflow menu — copy
   * number, portal link, document settings. They live here so the page
   * has one "…" menu rather than a status menu beside a page menu.
   */
  menuExtras?: React.ReactNode;
};

const CONFIRM_COPY: Record<
  string,
  { title: string; description: (number: string) => string; label: string }
> = {
  sent: {
    title: "Send invoice?",
    description: (n) => `This will send ${n} to the client via their portal link.`,
    label: "Send",
  },
  cancelled: {
    title: "Cancel invoice?",
    description: (n) => `This will cancel ${n}. This cannot be undone.`,
    label: "Cancel Invoice",
  },
};

/**
 * The invoice's state-changing actions: one primary button for the step
 * the invoice is actually waiting on, everything else behind "…".
 *
 * Previously every applicable action rendered as a button, so a sent
 * invoice showed three (Mark as Viewed, Record Payment, Cancel) with no
 * indication which one mattered. Only one of them is the common daily
 * action — money arriving — so that one is the button and the rest step
 * back. Nothing was removed; Edit moved to the toolbar, where it applies
 * to the document rather than to its status.
 */
export function InvoiceStatusActions({
  invoice,
  onRecordPayment,
  menuExtras,
}: InvoiceStatusActionsProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [confirmTarget, setConfirmTarget] = useState<InvoiceStatus | null>(null);

  function transition(status: InvoiceStatus) {
    startTransition(async () => {
      const result = await updateInvoiceStatus(workspace.id, invoice.id, status);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Invoice status updated", "success");
      setConfirmTarget(null);
      router.refresh();
    });
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
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Invoice deleted", "success");
      router.push(`/${workspace.slug}/invoices`);
    });
  }

  const canRecordPayment = ["sent", "viewed", "partial", "overdue"].includes(
    invoice.status
  );
  const canMarkViewed = invoice.status === "sent";
  const canCancel = invoice.status === "sent" || invoice.status === "viewed";
  const isDraft = invoice.status === "draft";
  const hasStatusMenuItems = canMarkViewed || canCancel || isDraft;

  return (
    <>
      {isDraft && (
        <Button onClick={() => setConfirmTarget("sent")} disabled={isPending}>
          <Send className="mr-1.5 h-4 w-4" />
          Send Invoice
        </Button>
      )}

      {canRecordPayment && (
        <Button onClick={onRecordPayment} disabled={isPending}>
          Record Payment
        </Button>
      )}

      {(hasStatusMenuItems || menuExtras) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="More actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {menuExtras}
            {menuExtras && hasStatusMenuItems && <DropdownMenuSeparator />}
            {canMarkViewed && (
              <DropdownMenuItem
                onClick={() => transition("viewed")}
                disabled={isPending}
              >
                <Eye className="mr-2 h-4 w-4" />
                Mark as Viewed
              </DropdownMenuItem>
            )}
            {canCancel && (
              <DropdownMenuItem
                onClick={() => setConfirmTarget("cancelled")}
                disabled={isPending}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Cancel Invoice
              </DropdownMenuItem>
            )}
            {isDraft && (
              <DropdownMenuItem
                onClick={handleDelete}
                disabled={isPending}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog
        open={!!confirmTarget}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        <DialogContent>
          {confirmTarget && CONFIRM_COPY[confirmTarget] && (
            <>
              <DialogHeader>
                <DialogTitle>{CONFIRM_COPY[confirmTarget].title}</DialogTitle>
                <DialogDescription>
                  {CONFIRM_COPY[confirmTarget].description(invoice.invoice_number)}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setConfirmTarget(null)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => transition(confirmTarget)}
                  disabled={isPending}
                >
                  {isPending ? "Processing..." : CONFIRM_COPY[confirmTarget].label}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
