"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  MoreHorizontal,
  Pencil,
  PowerOff,
  Power,
  Trash2,
} from "lucide-react";
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
import {
  deleteCatalogItem,
  duplicateCatalogItem,
  setCatalogItemActive,
} from "@/features/catalog/actions";
import type { CatalogItem } from "@/features/catalog/types";

type CatalogRowActionsProps = {
  item: CatalogItem;
};

// Quick-actions menu shared by the catalog table row and grid card — one
// menu, one set of rules, rendered from either surface. Catalog items have
// no status pipeline (only an is_active flag), so this menu is simpler
// than the invoice/quotation ones: no send/void/status-transition section.
export function CatalogRowActions({ item }: CatalogRowActionsProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { workspace, can } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();

  function handleDuplicate() {
    startTransition(async () => {
      const result = await duplicateCatalogItem(workspace.id, item.id);
      if (result.error) return toast(result.error, "error");
      toast(`Duplicated as "${result.data!.name}"`, "success");
      router.refresh();
    });
  }

  function handleToggleActive() {
    startTransition(async () => {
      const result = await setCatalogItemActive(workspace.id, item.id, !item.is_active);
      if (result.error) return toast(result.error, "error");
      toast(item.is_active ? "Marked inactive" : "Marked active", "success");
      router.refresh();
    });
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete this catalog item?",
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteCatalogItem(workspace.id, item.id);
      if (result.error) return toast(result.error, "error");
      toast("Catalog item deleted", "success");
      router.refresh();
    });
  }

  if (!can("staff")) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
          disabled={isPending}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          onClick={() => router.push(`/${workspace.slug}/catalog/${item.id}/edit`)}
        >
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDuplicate}>
          <Copy className="mr-2 h-4 w-4" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleToggleActive}>
          {item.is_active ? (
            <PowerOff className="mr-2 h-4 w-4" />
          ) : (
            <Power className="mr-2 h-4 w-4" />
          )}
          {item.is_active ? "Mark Inactive" : "Mark Active"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
