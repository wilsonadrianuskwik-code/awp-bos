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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { createQuotationTemplate } from "@/features/quotations/actions";
import type { LineItemInput } from "@/features/quotations/validators";
import type { QuotationTemplateWithItems } from "@/features/quotations/types";

type SaveAsTemplateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: LineItemInput[];
  onSaved: (template: QuotationTemplateWithItems) => void;
};

export function SaveAsTemplateDialog({
  open,
  onOpenChange,
  items,
  onSaved,
}: SaveAsTemplateDialogProps) {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (!name.trim()) {
      toast("Template name is required", "error");
      return;
    }
    if (items.length === 0) {
      toast("Add at least one line item first", "error");
      return;
    }

    startTransition(async () => {
      const result = await createQuotationTemplate(workspace.id, {
        name,
        description,
        items,
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Template saved", "success");
      onSaved(result.data!);
      setName("");
      setDescription("");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as Template</DialogTitle>
          <DialogDescription>
            Save the current line items ({items.length}) as a reusable
            template.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Starter SEO Package"
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
