"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import {
  duplicateQuotation,
  createQuotationVersion,
  deleteQuotation,
  updateQuotationStatus,
} from "@/features/quotations/actions";
import type { Quotation, QuotationStatus } from "@/features/quotations/types";

type QuotationStatusActionsProps = {
  quotation: Quotation;
  onGenerateInvoice: () => void;
};

const CONFIRM_COPY: Record<
  string,
  { title: string; description: (number: string) => string; label: string }
> = {
  sent: {
    title: "Send quotation?",
    description: (n) =>
      `This will send ${n} to the client via their portal link.`,
    label: "Send",
  },
  approved: {
    title: "Approve quotation?",
    description: (n) =>
      `Mark ${n} as approved. You'll then be able to generate a draft invoice.`,
    label: "Approve",
  },
  rejected: {
    title: "Reject quotation?",
    description: (n) => `Mark ${n} as rejected.`,
    label: "Reject",
  },
  cancelled: {
    title: "Cancel quotation?",
    description: (n) => `This will cancel ${n}. This cannot be undone.`,
    label: "Cancel Quotation",
  },
};

export function QuotationStatusActions({
  quotation,
  onGenerateInvoice,
}: QuotationStatusActionsProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [confirmTarget, setConfirmTarget] = useState<QuotationStatus | null>(
    null
  );

  function transition(status: QuotationStatus) {
    startTransition(async () => {
      const result = await updateQuotationStatus(
        workspace.id,
        quotation.id,
        status
      );
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast(`Quotation status updated`, "success");
      setConfirmTarget(null);
      router.refresh();
    });
  }

  function handleDuplicate() {
    startTransition(async () => {
      const result = await duplicateQuotation(workspace.id, quotation.id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast(`Duplicated as ${result.data!.quotation_number}`, "success");
      router.push(`/${workspace.slug}/quotations/${result.data!.id}`);
    });
  }

  function handleNewVersion() {
    startTransition(async () => {
      const result = await createQuotationVersion(workspace.id, quotation.id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast(`Created V${result.data!.version}`, "success");
      router.push(`/${workspace.slug}/quotations/${result.data!.id}`);
    });
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete ${quotation.quotation_number}?`,
      description: "It will move to trash.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteQuotation(workspace.id, quotation.id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Quotation deleted", "success");
      router.push(`/${workspace.slug}/quotations`);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {quotation.status === "draft" && (
        <>
          <Button onClick={() => setConfirmTarget("sent")} disabled={isPending}>
            Send Quotation
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              router.push(`/${workspace.slug}/quotations/${quotation.id}/edit`)
            }
          >
            Edit
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
            Delete
          </Button>
        </>
      )}

      {quotation.status === "sent" && (
        <>
          <Button
            variant="outline"
            onClick={() => transition("viewed")}
            disabled={isPending}
          >
            Mark as Viewed
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirmTarget("cancelled")}
            disabled={isPending}
          >
            Cancel
          </Button>
        </>
      )}

      {quotation.status === "viewed" && (
        <>
          <Button onClick={() => setConfirmTarget("approved")} disabled={isPending}>
            Approve
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirmTarget("rejected")}
            disabled={isPending}
          >
            Reject
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirmTarget("cancelled")}
            disabled={isPending}
          >
            Cancel
          </Button>
        </>
      )}

      {quotation.status === "revision_requested" && (
        <>
          <Button
            variant="outline"
            onClick={() =>
              router.push(`/${workspace.slug}/quotations/${quotation.id}/edit`)
            }
          >
            Edit
          </Button>
          <Button onClick={() => setConfirmTarget("sent")} disabled={isPending}>
            Resend
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirmTarget("cancelled")}
            disabled={isPending}
          >
            Cancel
          </Button>
        </>
      )}

      {quotation.status === "approved" &&
        (quotation.generated_invoice_id ? (
          <Button variant="outline" asChild>
            <Link
              href={`/${workspace.slug}/invoices/${quotation.generated_invoice_id}`}
            >
              View Invoice
            </Link>
          </Button>
        ) : (
          <Button onClick={onGenerateInvoice}>Generate Invoice</Button>
        ))}

      {(quotation.status === "rejected" ||
        quotation.status === "expired" ||
        quotation.status === "cancelled") && (
        <Button variant="outline" onClick={handleNewVersion} disabled={isPending}>
          Create New Version
        </Button>
      )}

      {/* Available regardless of status — a quick way to start a fresh
          quotation from this one's contents, at any point in its lifecycle. */}
      <Button variant="outline" onClick={handleDuplicate} disabled={isPending}>
        Duplicate as New Draft
      </Button>

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
                <DialogTitle>{CONFIRM_COPY[confirmTarget].title}</DialogTitle>
                <DialogDescription>
                  {CONFIRM_COPY[confirmTarget].description(
                    quotation.quotation_number
                  )}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setConfirmTarget(null)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => transition(confirmTarget)}
                  disabled={isPending}
                >
                  {isPending ? "Processing..." : CONFIRM_COPY[confirmTarget].label}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
