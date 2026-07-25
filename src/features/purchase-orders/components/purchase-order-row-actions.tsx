"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Hash, MoreHorizontal, Pencil, Send, Ban, Trash2 } from "lucide-react";
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
import { deletePurchaseOrder, updatePurchaseOrderStatus } from "@/features/purchase-orders/actions";
import type { PurchaseOrderWithRelations } from "@/features/purchase-orders/types";

type PurchaseOrderRowActionsProps = {
  purchaseOrder: PurchaseOrderWithRelations;
};

// Quick-actions menu shared by the PO card (Kanban) and table row —
// mirrors InvoiceRowActions's pattern of one menu whose contents depend
// on the document's current status.
export function PurchaseOrderRowActions({ purchaseOrder }: PurchaseOrderRowActionsProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { workspace, can } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();

  const href = `/${workspace.slug}/purchase-orders/${purchaseOrder.id}`;
  const editable = purchaseOrder.status === "draft";
  const canSend = purchaseOrder.status === "draft";
  const canCancel = ["draft", "sent", "acknowledged"].includes(purchaseOrder.status);

  function transition(status: Parameters<typeof updatePurchaseOrderStatus>[2]) {
    startTransition(async () => {
      const result = await updatePurchaseOrderStatus(workspace.id, purchaseOrder.id, status);
      if (result.error) return toast(result.error, "error");
      toast("Purchase order status updated", "success");
      router.refresh();
    });
  }

  async function handleSend() {
    const ok = await confirm({
      title: "Send purchase order?",
      description: `This will mark ${purchaseOrder.po_number} as sent to the supplier.`,
      confirmLabel: "Send",
    });
    if (ok) transition("sent");
  }

  async function handleCancel() {
    const ok = await confirm({
      title: "Cancel purchase order?",
      description: `This will cancel ${purchaseOrder.po_number}. This cannot be undone.`,
      confirmLabel: "Cancel Purchase Order",
      destructive: true,
    });
    if (ok) transition("cancelled");
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete this purchase order?",
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deletePurchaseOrder(workspace.id, purchaseOrder.id);
      if (result.error) return toast(result.error, "error");
      toast("Purchase order deleted", "success");
      router.refresh();
    });
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
            navigator.clipboard.writeText(purchaseOrder.po_number);
            toast("PO number copied", "success");
          }}
        >
          <Hash className="mr-2 h-4 w-4" />
          Copy Number
        </DropdownMenuItem>

        {canSend && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Supplier</DropdownMenuLabel>
            <DropdownMenuItem onClick={handleSend}>
              <Send className="mr-2 h-4 w-4" />
              Send to Supplier
            </DropdownMenuItem>
          </>
        )}

        {canCancel && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={handleCancel}
              className="text-destructive focus:text-destructive"
            >
              <Ban className="mr-2 h-4 w-4" />
              Cancel
            </DropdownMenuItem>
          </>
        )}

        {can("staff") && editable && (
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
