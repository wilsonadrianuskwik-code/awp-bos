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
import { deletePurchaseOrder, updatePurchaseOrderStatus } from "@/features/purchase-orders/actions";
import type { PurchaseOrder, PurchaseOrderStatus } from "@/features/purchase-orders/types";

type PurchaseOrderStatusActionsProps = {
  purchaseOrder: PurchaseOrder;
};

const CONFIRM_COPY: Partial<
  Record<PurchaseOrderStatus, { title: string; description: (n: string) => string; label: string }>
> = {
  sent: {
    title: "Send purchase order?",
    description: (n) => `This will mark ${n} as sent to the supplier.`,
    label: "Send",
  },
  cancelled: {
    title: "Cancel purchase order?",
    description: (n) => `This will cancel ${n}. This cannot be undone.`,
    label: "Cancel Purchase Order",
  },
};

// Mirrors InvoiceStatusActions — the detail page's status-transition
// control, driven by update_purchase_order_status's status CHECK
// constraint (supabase/migrations/00071_purchase_orders.sql).
export function PurchaseOrderStatusActions({ purchaseOrder }: PurchaseOrderStatusActionsProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [confirmTarget, setConfirmTarget] = useState<PurchaseOrderStatus | null>(null);

  function transition(status: PurchaseOrderStatus) {
    startTransition(async () => {
      const result = await updatePurchaseOrderStatus(workspace.id, purchaseOrder.id, status);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Purchase order status updated", "success");
      setConfirmTarget(null);
      router.refresh();
    });
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete ${purchaseOrder.po_number}?`,
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deletePurchaseOrder(workspace.id, purchaseOrder.id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Purchase order deleted", "success");
      router.push(`/${workspace.slug}/purchase-orders`);
    });
  }

  const status = purchaseOrder.status;

  return (
    <div className="flex flex-wrap gap-2">
      {status === "draft" && (
        <>
          <Button onClick={() => setConfirmTarget("sent")} disabled={isPending}>
            Send to Supplier
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push(`/${workspace.slug}/purchase-orders/${purchaseOrder.id}/edit`)}
          >
            Edit
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
            Delete
          </Button>
        </>
      )}

      {status === "sent" && (
        <Button variant="outline" onClick={() => transition("acknowledged")} disabled={isPending}>
          Mark Acknowledged
        </Button>
      )}

      {status === "acknowledged" && (
        <>
          <Button onClick={() => transition("partially_received")} disabled={isPending}>
            Mark Partially Received
          </Button>
          <Button variant="outline" onClick={() => transition("received")} disabled={isPending}>
            Mark Received
          </Button>
        </>
      )}

      {status === "partially_received" && (
        <Button onClick={() => transition("received")} disabled={isPending}>
          Mark Received
        </Button>
      )}

      {["draft", "sent", "acknowledged"].includes(status) && (
        <Button variant="outline" onClick={() => setConfirmTarget("cancelled")} disabled={isPending}>
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
                <DialogTitle>{CONFIRM_COPY[confirmTarget]!.title}</DialogTitle>
                <DialogDescription>
                  {CONFIRM_COPY[confirmTarget]!.description(purchaseOrder.po_number)}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmTarget(null)} disabled={isPending}>
                  Cancel
                </Button>
                <Button onClick={() => transition(confirmTarget)} disabled={isPending}>
                  {isPending ? "Processing..." : CONFIRM_COPY[confirmTarget]!.label}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
