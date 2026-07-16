"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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

export function InvoiceStatusActions({
  invoice,
  onRecordPayment,
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

  return (
    <div className="flex flex-wrap gap-2">
      {invoice.status === "draft" && (
        <>
          <Button onClick={() => setConfirmTarget("sent")} disabled={isPending}>
            Send Invoice
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              router.push(`/${workspace.slug}/invoices/${invoice.id}/edit`)
            }
          >
            Edit
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
            Delete
          </Button>
        </>
      )}

      {invoice.status === "sent" && (
        <Button
          variant="outline"
          onClick={() => transition("viewed")}
          disabled={isPending}
        >
          Mark as Viewed
        </Button>
      )}

      {canRecordPayment && (
        <Button onClick={onRecordPayment} disabled={isPending}>
          Record Payment
        </Button>
      )}

      {(invoice.status === "sent" || invoice.status === "viewed") && (
        <Button
          variant="outline"
          onClick={() => setConfirmTarget("cancelled")}
          disabled={isPending}
        >
          Cancel
        </Button>
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
    </div>
  );
}
