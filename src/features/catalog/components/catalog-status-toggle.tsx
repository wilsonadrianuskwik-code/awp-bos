"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { setCatalogItemActive } from "@/features/catalog/actions";
import type { CatalogItem } from "@/features/catalog/types";

type CatalogStatusToggleProps = {
  item: CatalogItem;
};

// The one inline-editable cell in the catalog table/grid — clicking the
// status badge flips is_active immediately (no dialog, no navigation),
// matching the quick-toggle affordance Attio/Linear use for single-field
// state changes instead of routing through a full edit form.
export function CatalogStatusToggle({ item }: CatalogStatusToggleProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { workspace, can } = useWorkspace();
  const { toast } = useToast();

  if (!can("staff")) {
    return item.is_active ? (
      <Badge>Active</Badge>
    ) : (
      <Badge variant="secondary">Inactive</Badge>
    );
  }

  function handleClick() {
    startTransition(async () => {
      const result = await setCatalogItemActive(workspace.id, item.id, !item.is_active);
      if (result.error) return toast(result.error, "error");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        handleClick();
      }}
      disabled={isPending}
      className={cn(
        "transition-opacity disabled:opacity-50",
        "hover:opacity-80"
      )}
      title={item.is_active ? "Click to mark inactive" : "Click to mark active"}
    >
      {item.is_active ? (
        <Badge>Active</Badge>
      ) : (
        <Badge variant="secondary">Inactive</Badge>
      )}
    </button>
  );
}
