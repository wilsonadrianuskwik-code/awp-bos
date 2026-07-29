"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ClientSelector } from "@/features/line-items/components/client-selector";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { setCatalogItemClientPrice } from "@/features/catalog/actions";
import type { ClientSummary } from "@/features/line-items/types";
import type { CatalogItemClientPrice } from "@/features/catalog/types";

type ClientPriceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogItemId: string;
  currency: string;
  clients: ClientSummary[];
  onSaved: (price: CatalogItemClientPrice) => void;
};

// Set (or replace) one client's price override. A single form covers both
// "add a new override" and "edit an existing one" — picking a client who
// already has an override just overwrites it, same upsert either way.
export function ClientPriceDialog({
  open,
  onOpenChange,
  catalogItemId,
  currency,
  clients,
  onSaved,
}: ClientPriceDialogProps) {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [clientId, setClientId] = useState("");
  const [price, setPrice] = useState("");

  function reset() {
    setClientId("");
    setPrice("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) {
      toast("Choose a client", "error");
      return;
    }
    const unitPrice = Number(price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      toast("Enter a valid price", "error");
      return;
    }

    startTransition(async () => {
      const result = await setCatalogItemClientPrice(
        workspace.id,
        catalogItemId,
        clientId,
        unitPrice
      );
      if (result.error || !result.data) {
        toast(result.error ?? "Failed to save price", "error");
        return;
      }
      toast("Custom price saved", "success");
      onSaved(result.data as CatalogItemClientPrice);
      reset();
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Customer Price</DialogTitle>
            <DialogDescription>
              Override this item&apos;s price for one client. Every other
              client keeps the default price.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <ClientSelector
                clients={clients}
                value={clientId}
                onChange={(id) => setClientId(id)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-price">Price ({currency})</Label>
              <Input
                id="client-price"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                autoFocus
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Price"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
