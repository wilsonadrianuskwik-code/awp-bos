"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { TemplateWithItems } from "@/features/line-items/types";
import type { LineItemInput } from "@/features/line-items/validators";

type TemplatePickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: TemplateWithItems[];
  onInsert: (items: LineItemInput[]) => void;
};

export function TemplatePickerDialog({
  open,
  onOpenChange,
  templates,
  onInsert,
}: TemplatePickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Insert from Template</DialogTitle>
          <DialogDescription>
            Add a saved bundle of line items to this document.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 space-y-2 overflow-y-auto">
          {templates.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No templates saved yet.
            </p>
          ) : (
            templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.items.length} item{t.items.length === 1 ? "" : "s"}
                    {t.description ? ` · ${t.description}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onInsert(
                      t.items.map((i) => ({
                        category: i.category,
                        description: i.description,
                        quantity: i.quantity,
                        unit_price: i.unit_price,
                        unit: i.unit ?? "",
                        discount_percent: i.discount_percent ?? 0,
                        tax_percent: i.tax_percent ?? 0,
                      }))
                    )
                  }
                >
                  Insert
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
