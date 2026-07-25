"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { deleteProformaInvoice, updateProformaInvoiceStatus } from "@/features/proforma-invoices/actions";
import type { ProformaInvoice, ProformaInvoiceStatus } from "@/features/proforma-invoices/types";

type ProformaInvoiceStatusActionsProps = {
  proformaInvoice: ProformaInvoice;
};

const CONFIRM_COPY: Record<
  string,
  { title: string; description: (number: string) => string; label: string }
> = {
  sent: {
    title: "Send proforma invoice?",
    description: (n) => `Mark ${n} as sent to the client.`,
    label: "Send",
  },
  accepted: {
    title: "Mark accepted?",
    description: (n) => `Mark ${n} as accepted by the client.`,
    label: "Accept",
  },
  cancelled: {
    title: "Cancel proforma invoice?",
    description: (n) => `This will cancel ${n}. This cannot be undone.`,
    label: "Cancel",
  },
};

export function ProformaInvoiceStatusActions({
  proformaInvoice,
}: ProformaInvoiceStatusActionsProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [confirmTarget, setConfirmTarget] = useState<ProformaInvoiceStatus | null>(null);

  function transition(status: ProformaInvoiceStatus) {
    startTransition(async () => {
      const result = await updateProformaInvoiceStatus(workspace.id, proformaInvoice.id, status);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Proforma invoice status updated", "success");
      setConfirmTarget(null);
      router.refresh();
    });
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete ${proformaInvoice.pi_number}?`,
      description: "It will move to trash.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteProformaInvoice(workspace.id, proformaInvoice.id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Proforma invoice deleted", "success");
      router.push(`/${workspace.slug}/proforma-invoices`);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {proformaInvoice.status === "draft" && (
        <>
          <Button onClick={() => setConfirmTarget("sent")} disabled={isPending}>
            Send
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              router.push(`/${workspace.slug}/proforma-invoices/${proformaInvoice.id}/edit`)
            }
          >
            Edit
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
            Delete
          </Button>
        </>
      )}

      {proformaInvoice.status === "sent" && (
        <>
          <Button onClick={() => setConfirmTarget("accepted")} disabled={isPending}>
            Mark Accepted
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirmTarget("cancelled")}
            disabled={isPending}
          >
            Cancel
          </Button>
        </>
      )}

      {proformaInvoice.status === "accepted" &&
        (proformaInvoice.generated_invoice_id ? (
          <Button variant="outline" asChild>
            <Link href={`/${workspace.slug}/invoices/${proformaInvoice.generated_invoice_id}`}>
              View Invoice
            </Link>
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => setConfirmTarget("cancelled")}
            disabled={isPending}
          >
            Cancel
          </Button>
        ))}

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
                  {CONFIRM_COPY[confirmTarget].description(proformaInvoice.pi_number)}
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
                <Button onClick={() => transition(confirmTarget)} disabled={isPending}>
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
