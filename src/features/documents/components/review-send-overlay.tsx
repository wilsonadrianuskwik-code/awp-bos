"use client";

import { Loader2, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { LineItemTotals } from "@/features/line-items/helpers";
import type { LineItemInput } from "@/features/line-items/validators";

type ReviewSendOverlayProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "invoice" | "quotation" — used in copy. */
  docNoun: string;
  workspaceName: string;
  title: string;
  recipientName: string;
  recipientDetail?: string;
  /** Label/value meta rows shown in the rail (dates etc.). */
  meta: { label: string; value: string }[];
  items: LineItemInput[];
  totals: LineItemTotals;
  currency: string;
  sending: boolean;
  onSend: () => void;
};

// The send moment: a focused review of what the client will receive,
// with the commit action beside it. Sending is irreversible — modals are
// for commits, never for editing — so this is the one place the document
// appears as an artifact before it leaves. (Document-styled preview from
// live state; the fully themed DocumentRenderView needs template data the
// builder routes don't fetch yet.)
export function ReviewSendOverlay({
  open,
  onOpenChange,
  docNoun,
  workspaceName,
  title,
  recipientName,
  recipientDetail,
  meta,
  items,
  totals,
  currency,
  sending,
  onSend,
}: ReviewSendOverlayProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl gap-0 p-0">
        <DialogTitle className="sr-only">Review and send</DialogTitle>
        <div className="grid md:grid-cols-[minmax(0,1fr)_260px]">
          {/* The document, as the client will read it. */}
          <div className="max-h-[70vh] overflow-y-auto border-b p-8 md:border-b-0 md:border-r">
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm font-semibold">{workspaceName}</p>
              <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {docNoun}
              </span>
            </div>
            <h2 className="mt-6 text-2xl font-semibold tracking-tight">
              {title || `Untitled ${docNoun}`}
            </h2>
            <div className="mt-5 border-t pt-5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {docNoun === "quotation" ? "Prepared for" : "Bill to"}
              </p>
              <p className="mt-1 text-sm font-medium">{recipientName}</p>
              {recipientDetail && (
                <p className="text-[13px] text-muted-foreground">
                  {recipientDetail}
                </p>
              )}
            </div>
            <div className="mt-6 space-y-2">
              {items.map((item, i) => {
                const sub = item.quantity * item.unit_price;
                const disc = sub * ((item.discount_percent ?? 0) / 100);
                const line = sub - disc;
                const amount = line + line * ((item.tax_percent ?? 0) / 100);
                return (
                  <div
                    key={i}
                    className="flex items-baseline justify-between gap-4 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {item.description}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {item.quantity} ×{" "}
                      {formatCurrency(item.unit_price, currency)}
                    </span>
                    <span className="w-28 shrink-0 text-right tabular-nums">
                      {formatCurrency(amount, currency)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="ml-auto mt-6 w-64 space-y-1.5 border-t pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">
                  {formatCurrency(totals.subtotal, currency)}
                </span>
              </div>
              {totals.discount_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="tabular-nums text-red-600 dark:text-red-400">
                    −{formatCurrency(totals.discount_amount, currency)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="tabular-nums">
                  {formatCurrency(totals.tax_amount, currency)}
                </span>
              </div>
              <div className="flex items-baseline justify-between border-t pt-2">
                <span className="font-medium">Total</span>
                <span className="text-lg font-semibold tabular-nums">
                  {formatCurrency(totals.total, currency)}
                </span>
              </div>
            </div>
          </div>

          {/* The commit rail. */}
          <div className="flex flex-col justify-between p-6">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Sending to
              </p>
              <p className="mt-1.5 text-sm font-medium">{recipientName}</p>
              {recipientDetail && (
                <p className="text-[13px] text-muted-foreground">
                  {recipientDetail}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Delivered via their client portal link.
              </p>
              <div className="mt-5 space-y-2 border-t pt-4 text-[13px]">
                {meta.map((m) => (
                  <div key={m.label} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{m.label}</span>
                    <span className="tabular-nums">{m.value}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-3 border-t pt-2">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(totals.total, currency)}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-8 space-y-2">
              <Button
                type="button"
                className="w-full"
                onClick={onSend}
                disabled={sending}
              >
                {sending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send {docNoun}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => onOpenChange(false)}
                disabled={sending}
              >
                Back to editing
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
