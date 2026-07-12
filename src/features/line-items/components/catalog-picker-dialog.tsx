"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { CatalogItem } from "@/features/catalog/types";
import type { LineItemInput } from "@/features/line-items/validators";

type CatalogPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogItems: CatalogItem[];
  documentCurrency: string;
  onInsert: (item: LineItemInput) => void;
};

export function CatalogPickerDialog({
  open,
  onOpenChange,
  catalogItems,
  documentCurrency,
  onInsert,
}: CatalogPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Insert from Catalog</DialogTitle>
          <DialogDescription>
            Add a product or service from your catalog as a new line item.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 space-y-2 overflow-y-auto">
          {catalogItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No catalog items yet.
            </p>
          ) : (
            catalogItems.map((item) => {
              const mismatched = item.currency !== documentCurrency;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatCurrency(item.default_unit_price, item.currency)}
                      {item.default_unit ? ` / ${item.default_unit}` : ""}
                    </p>
                    {mismatched && (
                      <Badge variant="destructive" className="mt-1">
                        Currency mismatch — priced in {item.currency}, this
                        document is in {documentCurrency}
                      </Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mismatched}
                    onClick={() =>
                      onInsert({
                        category: item.default_category,
                        description: item.description
                          ? `${item.name} — ${item.description}`
                          : item.name,
                        quantity: 1,
                        unit_price: item.default_unit_price,
                        unit: item.default_unit ?? "",
                        discount_percent: 0,
                        tax_percent: 0,
                        catalog_item_id: item.id,
                      })
                    }
                  >
                    Insert
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
