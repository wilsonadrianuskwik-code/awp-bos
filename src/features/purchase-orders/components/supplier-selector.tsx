"use client";

import { useState, useTransition } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { createSupplierAction } from "@/features/suppliers/actions";
import type { SupplierSummary } from "@/features/suppliers/types";

type SupplierSelectorProps = {
  suppliers: SupplierSummary[];
  value: string;
  onChange: (supplierId: string, supplier: SupplierSummary) => void;
};

// Mirrors ClientSelector (@/features/line-items/components/client-selector)
// almost exactly — suppliers structurally mirror clients, and the Purchase
// Order builder should feel identical to the Invoice builder apart from
// who the document is addressed to.
export function SupplierSelector({ suppliers, value, onChange }: SupplierSelectorProps) {
  const { can } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [createdSuppliers, setCreatedSuppliers] = useState<SupplierSummary[]>([]);
  const allSuppliers = [...createdSuppliers, ...suppliers];
  const [dialogOpen, setDialogOpen] = useState(false);

  const selected = allSuppliers.find((s) => s.id === value);
  const term = query.trim().toLowerCase();
  const filtered = allSuppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(term) ||
      (s.company ?? "").toLowerCase().includes(term) ||
      (s.email ?? "").toLowerCase().includes(term)
  );

  const canCreate = can("staff");
  const hasExactMatch = allSuppliers.some(
    (s) => s.name.trim().toLowerCase() === term
  );
  const showCreate = canCreate && term.length > 0 && !hasExactMatch;

  function handleSelect(supplier: SupplierSummary) {
    onChange(supplier.id, supplier);
    setOpen(false);
    setQuery("");
  }

  function handleCreated(supplier: SupplierSummary) {
    setCreatedSuppliers((prev) => [supplier, ...prev]);
    handleSelect(supplier);
    setDialogOpen(false);
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            {selected ? (
              <span className="truncate">
                {selected.name}
                {selected.company ? ` · ${selected.company}` : ""}
              </span>
            ) : (
              <span className="text-muted-foreground">Select a supplier...</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="p-2">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search suppliers..."
              className="h-8"
            />
          </div>
          <div className="max-h-60 overflow-y-auto border-t">
            {filtered.length === 0 && !showCreate ? (
              <p className="p-3 text-sm text-muted-foreground">No suppliers found.</p>
            ) : (
              <>
                {filtered.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelect(s)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="truncate">
                      <span className="font-medium">{s.name}</span>
                      {s.company && (
                        <span className="text-muted-foreground"> · {s.company}</span>
                      )}
                    </span>
                    {s.id === value && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                ))}
                {showCreate && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setDialogOpen(true);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm text-primary hover:bg-accent"
                    )}
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span className="truncate">
                      Create new supplier &ldquo;{query.trim()}&rdquo;
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <CreateSupplierDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialName={query.trim()}
        onCreated={handleCreated}
      />
    </>
  );
}

type CreateSupplierDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  onCreated: (supplier: SupplierSummary) => void;
};

function CreateSupplierDialog({
  open,
  onOpenChange,
  initialName,
  onCreated,
}: CreateSupplierDialogProps) {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    const name = (formData.get("name") as string)?.trim() ?? "";
    if (!name) {
      toast("Supplier name is required", "error");
      return;
    }

    startTransition(async () => {
      const result = await createSupplierAction(workspace.id, formData);
      if (result.error || !result.data) {
        toast(result.error ?? "Failed to create supplier", "error");
        return;
      }

      onCreated({
        id: result.data.id,
        name,
        company: (formData.get("company") as string)?.trim() || null,
        email: (formData.get("email") as string)?.trim() || null,
      });
      toast("Supplier created", "success");
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Supplier</DialogTitle>
            <DialogDescription>
              Add a new supplier without leaving this document. You can fill
              in the rest of their details later from the Suppliers page.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-supplier-name">Name *</Label>
              <Input
                id="new-supplier-name"
                name="name"
                defaultValue={initialName}
                required
                maxLength={255}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-supplier-company">Company</Label>
              <Input id="new-supplier-company" name="company" maxLength={255} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-supplier-email">Email</Label>
                <Input id="new-supplier-email" name="email" type="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-supplier-phone">Phone</Label>
                <Input id="new-supplier-phone" name="phone" maxLength={50} />
              </div>
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
              {isPending ? "Creating..." : "Create & Select"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
