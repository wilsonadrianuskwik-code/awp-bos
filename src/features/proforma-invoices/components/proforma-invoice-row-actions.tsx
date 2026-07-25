"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { useConfirm } from "@/providers/confirm-provider";
import { deleteProformaInvoice, updateProformaInvoiceStatus } from "@/features/proforma-invoices/actions";
import { isEditableStatus } from "@/features/proforma-invoices/helpers";
import type { ProformaInvoiceWithClient } from "@/features/proforma-invoices/types";

type ProformaInvoiceRowActionsProps = {
  proformaInvoice: ProformaInvoiceWithClient;
};

export function ProformaInvoiceRowActions({ proformaInvoice }: ProformaInvoiceRowActionsProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { workspace, can } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();

  const href = `/${workspace.slug}/proforma-invoices/${proformaInvoice.id}`;
  const editable = isEditableStatus(proformaInvoice.status);
  const canSend = proformaInvoice.status === "draft";

  async function handleSend() {
    const ok = await confirm({
      title: "Send proforma invoice?",
      description: `Mark ${proformaInvoice.pi_number} as sent.`,
      confirmLabel: "Send",
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await updateProformaInvoiceStatus(workspace.id, proformaInvoice.id, "sent");
      if (result.error) return toast(result.error, "error");
      toast("Proforma invoice sent", "success");
      router.refresh();
    });
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete this proforma invoice?",
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteProformaInvoice(workspace.id, proformaInvoice.id);
      if (result.error) return toast(result.error, "error");
      toast("Proforma invoice deleted", "success");
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
          disabled={isPending}
          aria-label="More actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {editable && (
          <DropdownMenuItem onClick={() => router.push(`${href}/edit`)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
        )}
        {canSend && (
          <DropdownMenuItem onClick={handleSend}>
            <Send className="mr-2 h-4 w-4" />
            Send
          </DropdownMenuItem>
        )}
        {can("staff") && editable && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
