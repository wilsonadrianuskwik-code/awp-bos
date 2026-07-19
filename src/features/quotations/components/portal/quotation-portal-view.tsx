"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, XCircle, MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/providers/toast-provider";
import { LineItemsTable } from "@/features/line-items/components/line-items-table";
import { PricingSummary } from "@/features/line-items/components/pricing-summary";
import {
  recordQuotationFirstView,
  approveQuotationByCustomer,
  rejectQuotationByCustomer,
  requestQuotationRevision,
} from "@/features/quotations/actions";
import type { QuotationDetail, QuotationStatus } from "@/features/quotations/types";
import type { PackageItem } from "@/features/catalog/types";

type QuotationPortalViewProps = {
  shareToken: string;
  quotation: QuotationDetail;
  workspaceName: string;
  /** Live package contents by catalog_item_id, for any package line items —
      see getPackageBreakdownsForPortal. */
  packageBreakdowns?: Record<string, PackageItem[]>;
};

const STATUS_MESSAGE: Partial<Record<QuotationStatus, { icon: typeof CheckCircle2; text: string; tone: string }>> = {
  approved: {
    icon: CheckCircle2,
    text: "You approved this quotation.",
    tone: "text-emerald-600 dark:text-emerald-400",
  },
  rejected: {
    icon: XCircle,
    text: "You rejected this quotation.",
    tone: "text-red-600 dark:text-red-400",
  },
  revision_requested: {
    icon: MessageSquareWarning,
    text: "You requested a revision. The team has been notified.",
    tone: "text-amber-600 dark:text-amber-400",
  },
  expired: {
    icon: XCircle,
    text: "This quotation has expired.",
    tone: "text-muted-foreground",
  },
  cancelled: {
    icon: XCircle,
    text: "This quotation has been cancelled.",
    tone: "text-muted-foreground",
  },
};

export function QuotationPortalView({
  shareToken,
  quotation: initialQuotation,
  workspaceName,
  packageBreakdowns = {},
}: QuotationPortalViewProps) {
  const { toast } = useToast();
  const [quotation, setQuotation] = useState(initialQuotation);
  const [isPending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<"reject" | "revision" | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    recordQuotationFirstView(shareToken).then((result) => {
      if (result.data) setQuotation((prev) => ({ ...prev, ...result.data }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canRespond = quotation.status === "sent" || quotation.status === "viewed";

  function handleApprove() {
    startTransition(async () => {
      const result = await approveQuotationByCustomer(shareToken);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      setQuotation((prev) => ({ ...prev, ...result.data }));
      toast("Quotation approved", "success");
    });
  }

  function submitDialog() {
    startTransition(async () => {
      const result =
        dialog === "reject"
          ? await rejectQuotationByCustomer(shareToken, message)
          : await requestQuotationRevision(shareToken, message);

      if (result.error) {
        toast(result.error, "error");
        return;
      }
      setQuotation((prev) => ({ ...prev, ...result.data }));
      toast(
        dialog === "reject" ? "Quotation rejected" : "Revision requested",
        "success"
      );
      setDialog(null);
      setMessage("");
    });
  }

  const statusInfo = STATUS_MESSAGE[quotation.status];

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-background px-4 py-10">
      <div className="mb-8 flex items-center justify-between border-b pb-6">
        <h1 className="text-xl font-bold">{workspaceName}</h1>
        <div className="text-right">
          <h2 className="text-lg font-semibold uppercase tracking-wide text-muted-foreground">
            Quotation
          </h2>
          <p className="text-sm">
            {quotation.quotation_number}
            {quotation.version > 1 ? ` (V${quotation.version})` : ""}
          </p>
        </div>
      </div>

      {statusInfo && (
        <div className={`mb-6 flex items-center gap-2 rounded-lg border p-4 text-sm font-medium ${statusInfo.tone}`}>
          <statusInfo.icon className="h-5 w-5 shrink-0" />
          {statusInfo.text}
        </div>
      )}

      {quotation.title && (
        <h3 className="mb-1 text-2xl font-semibold">{quotation.title}</h3>
      )}
      {quotation.summary && (
        <p className="mb-6 text-muted-foreground">{quotation.summary}</p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Prepared for</p>
          <p className="font-medium">{quotation.client.name}</p>
          {quotation.client.company && <p>{quotation.client.company}</p>}
        </div>
        <div className="text-right">
          <p>
            <span className="text-muted-foreground">Issue date: </span>
            {new Date(quotation.issue_date).toLocaleDateString()}
          </p>
          {quotation.expiry_date && (
            <p>
              <span className="text-muted-foreground">Valid until: </span>
              {new Date(quotation.expiry_date).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <LineItemsTable
            lineItems={quotation.line_items}
            currency={quotation.currency}
            packageBreakdowns={packageBreakdowns}
          />
        </CardContent>
      </Card>

      <div className="mb-6">
        <PricingSummary
          totals={{
            subtotal: quotation.subtotal,
            discount_amount: quotation.discount_amount,
            tax_amount: quotation.tax_amount,
            total: quotation.total,
          }}
          currency={quotation.currency}
          itemCount={quotation.line_items.length}
          sticky={false}
        />
      </div>

      {quotation.notes && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="text-sm [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
              dangerouslySetInnerHTML={{ __html: quotation.notes }}
            />
          </CardContent>
        </Card>
      )}

      {quotation.terms_and_conditions && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Terms &amp; Conditions</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="text-sm [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
              dangerouslySetInnerHTML={{ __html: quotation.terms_and_conditions }}
            />
          </CardContent>
        </Card>
      )}

      {canRespond && (
        <div className="flex flex-wrap gap-3 border-t pt-6">
          <Button onClick={handleApprove} disabled={isPending}>
            Approve
          </Button>
          <Button
            variant="outline"
            onClick={() => setDialog("revision")}
            disabled={isPending}
          >
            Request Revision
          </Button>
          <Button
            variant="outline"
            onClick={() => setDialog("reject")}
            disabled={isPending}
          >
            Reject
          </Button>
        </div>
      )}

      <Dialog
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === "reject" ? "Reject Quotation" : "Request Revision"}
            </DialogTitle>
            <DialogDescription>
              {dialog === "reject"
                ? "Let the team know why (optional)."
                : "Tell the team what you'd like changed."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder={
              dialog === "reject" ? "Reason (optional)" : "What would you like changed?"
            }
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialog(null)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={submitDialog} disabled={isPending}>
              {isPending ? "Submitting..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
