"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { convertLeadToClient } from "@/features/leads/actions";
import type { Lead } from "@/features/leads/types";

type LeadConvertDialogProps = {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function LeadConvertDialog({
  lead,
  open,
  onOpenChange,
}: LeadConvertDialogProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();

  function handleConvert() {
    startTransition(async () => {
      const result = await convertLeadToClient(workspace.id, lead.id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast(`"${lead.name}" converted to client`, "success");
      onOpenChange(false);
      router.push(`/${workspace.slug}/clients/${result.data!.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert Lead to Client</DialogTitle>
          <DialogDescription>
            This will create a new client from &quot;{lead.name}&quot; and mark
            this lead as won. The lead record will be preserved as history.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md bg-muted p-4 text-sm">
          <p className="font-medium">The following data will be copied:</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
            <li>Name: {lead.name}</li>
            {lead.email && <li>Email: {lead.email}</li>}
            {lead.phone && <li>Phone: {lead.phone}</li>}
            {lead.company && <li>Company: {lead.company}</li>}
          </ul>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleConvert} disabled={isPending}>
            {isPending ? "Converting..." : "Convert to Client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
