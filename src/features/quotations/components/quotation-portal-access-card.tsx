"use client";

import { useState, useTransition } from "react";
import { Copy, Hash, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { regenerateShareToken } from "@/features/quotations/actions";
import { formatTimelineTimestamp } from "@/features/quotations/helpers";
import type { Quotation } from "@/features/quotations/types";

type QuotationPortalAccessCardProps = {
  quotation: Pick<
    Quotation,
    "id" | "quotation_number" | "share_token" | "view_count" | "last_viewed_at"
  >;
};

export function QuotationPortalAccessCard({
  quotation,
}: QuotationPortalAccessCardProps) {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [shareToken, setShareToken] = useState(quotation.share_token);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function copyLink() {
    const url = `${window.location.origin}/portal/quotations/${shareToken}`;
    navigator.clipboard.writeText(url);
    toast("Public link copied", "success");
  }

  function copyNumber() {
    navigator.clipboard.writeText(quotation.quotation_number);
    toast("Quotation number copied", "success");
  }

  function handleRegenerate() {
    startTransition(async () => {
      const result = await regenerateShareToken(workspace.id, quotation.id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      setShareToken(result.data!.share_token);
      toast("Share link regenerated — the old link no longer works", "success");
      setConfirmOpen(false);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Customer Portal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm">
          {quotation.view_count > 0 ? (
            <>
              <p className="font-medium">
                Viewed {quotation.view_count} time
                {quotation.view_count === 1 ? "" : "s"}
              </p>
              {quotation.last_viewed_at && (
                <p className="text-xs text-muted-foreground">
                  Last viewed: {formatTimelineTimestamp(quotation.last_viewed_at)}
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">Not yet viewed by the client.</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={copyLink}>
            <Copy className="mr-2 h-4 w-4" />
            Copy Public Link
          </Button>
          <Button variant="outline" size="sm" onClick={copyNumber}>
            <Hash className="mr-2 h-4 w-4" />
            Copy Number
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmOpen(true)}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Regenerate Link
          </Button>
        </div>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate share link?</DialogTitle>
            <DialogDescription>
              The current portal link will stop working immediately. Anyone
              with the old link — including the client, if it was already
              sent — will no longer be able to open this quotation.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRegenerate}
              disabled={isPending}
            >
              {isPending ? "Regenerating..." : "Regenerate Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
