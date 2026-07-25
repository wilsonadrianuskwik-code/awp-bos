"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileOutput, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { generateDocument } from "@/features/proforma-invoices/actions";

export type GenerateTarget = {
  /** document_type_registry key, e.g. "proforma_invoice" | "invoice" | "purchase_order". */
  toType: string;
  label: string;
  /** Route segment the new document lives under, e.g. "proforma-invoices". */
  routeSegment: string;
};

type GenerateDocumentMenuProps = {
  fromType: string;
  fromId: string;
  targets: GenerateTarget[];
};

// Shared "Generate..." action across every document detail page (Quotation,
// Proforma Invoice) — a thin dropdown over the generic generate_document()
// RPC (00074_document_engine_seed_and_generate.sql), so adding a new
// downstream document type is just adding an entry to `targets`.
export function GenerateDocumentMenu({ fromType, fromId, targets }: GenerateDocumentMenuProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  if (targets.length === 0) return null;

  function handleGenerate(target: GenerateTarget) {
    startTransition(async () => {
      const result = await generateDocument(workspace.id, fromType, fromId, target.toType);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast(`${target.label} generated`, "success");
      const newId = (result.data as { id: string }).id;
      router.push(`/${workspace.slug}/${target.routeSegment}/${newId}`);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={isPending}>
          <FileOutput className="mr-2 h-4 w-4" />
          Generate...
          <ChevronDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {targets.map((target) => (
          <DropdownMenuItem key={target.toType} onClick={() => handleGenerate(target)}>
            {target.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
