"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";
import { diffQuotationFields, diffLineItems } from "@/features/quotations/helpers";
import type { QuotationDetail } from "@/features/quotations/types";

type QuotationVersionDiffDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: QuotationDetail;
  previous: QuotationDetail;
};

export function QuotationVersionDiffDialog({
  open,
  onOpenChange,
  current,
  previous,
}: QuotationVersionDiffDialogProps) {
  const fieldDiffs = diffQuotationFields(previous, current);
  const itemDiffs = diffLineItems(previous.line_items, current.line_items).filter(
    (d) => d.status !== "unchanged"
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Compare V{previous.version} → V{current.version}
          </DialogTitle>
          <DialogDescription>
            Changes between {previous.quotation_number} and{" "}
            {current.quotation_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Details Changed
            </h4>
            {fieldDiffs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No detail fields changed.
              </p>
            ) : (
              <div className="space-y-2">
                {fieldDiffs.map((d) => (
                  <div key={d.field} className="rounded-lg border p-2 text-sm">
                    <p className="text-xs font-medium text-muted-foreground">
                      {d.label}
                    </p>
                    <p className="text-red-600 line-through dark:text-red-400">
                      {d.previous || "—"}
                    </p>
                    <p className="text-emerald-600 dark:text-emerald-400">
                      {d.current || "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Line Items
            </h4>
            {itemDiffs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No line item changes.
              </p>
            ) : (
              <div className="space-y-2">
                {itemDiffs.map((d) => (
                  <div
                    key={d.key}
                    className={cn(
                      "rounded-lg border p-2 text-sm",
                      d.status === "added" &&
                        "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30",
                      d.status === "removed" &&
                        "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
                      d.status === "changed" &&
                        "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
                    )}
                  >
                    <p className="font-medium">
                      {d.status === "added" && "+ "}
                      {d.status === "removed" && "− "}
                      {(d.current ?? d.previous)!.description}
                    </p>
                    {d.status === "changed" && d.changedFields && (
                      <p className="text-xs text-muted-foreground">
                        Changed: {d.changedFields.join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
