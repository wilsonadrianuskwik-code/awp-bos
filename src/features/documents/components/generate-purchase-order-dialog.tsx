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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { generateDocument } from "@/features/proforma-invoices/actions";
import type { Supplier } from "@/features/suppliers/types";

type GeneratePurchaseOrderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** document_type_registry key of the source, e.g. "quotation" | "invoice". */
  fromType: string;
  fromId: string;
  /** The source's own number, shown so the user knows what they're copying. */
  fromNumber: string;
  suppliers: Supplier[];
};

/**
 * A Purchase Order is issued to a supplier, but the documents it can be
 * generated from (Quotation, Invoice) are customer-facing and name no
 * supplier — so their field mappings can't populate supplier_id, and
 * create_purchase_order rejects the call without one. This collects that
 * single missing field and passes it through generate_document's
 * p_overrides; everything else (project, currency, line items) still
 * comes from the mapping.
 */
export function GeneratePurchaseOrderDialog({
  open,
  onOpenChange,
  fromType,
  fromId,
  fromNumber,
  suppliers,
}: GeneratePurchaseOrderDialogProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [supplierId, setSupplierId] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    if (!supplierId) return;
    startTransition(async () => {
      const result = await generateDocument(
        workspace.id,
        fromType,
        fromId,
        "purchase_order",
        { supplier_id: supplierId }
      );
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Purchase order generated", "success");
      onOpenChange(false);
      const newId = (result.data as { id: string }).id;
      router.push(`/${workspace.slug}/purchase-orders/${newId}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate purchase order</DialogTitle>
          <DialogDescription>
            Creates a draft purchase order from {fromNumber}, copying its
            project, currency and line items. Choose the supplier to order from.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Supplier
          </label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a supplier" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.company ? ` — ${s.company}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {suppliers.length === 0 && (
            <p className="text-[13px] text-muted-foreground">
              No suppliers yet — add one under Procurement → Suppliers first.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isPending || !supplierId}
            loading={isPending}
          >
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
