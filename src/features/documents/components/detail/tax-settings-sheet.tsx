"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TaxSettingsPanel } from "@/features/documents/components/tax-settings-panel";
import type { TaxSettings } from "@/features/documents/tax";

/**
 * The tax editor as a slide-over, for document types whose only
 * configuration is the tax treatment. The invoice has its own sheet
 * because it also carries references and portal access.
 */
export function TaxSettingsSheet({
  open,
  onOpenChange,
  workspaceId,
  documentType,
  documentId,
  hargaJual,
  settings,
  editable,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  documentType: "invoice" | "proforma_invoice";
  documentId: string;
  hargaJual: number;
  settings: TaxSettings;
  editable: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="mb-5">
          <SheetTitle>Totals &amp; tax</SheetTitle>
          <SheetDescription>
            {editable
              ? "DPP fraction, PPN, and the withholdings that print on the document."
              : "Locked — an issued document keeps the rates it was issued under."}
          </SheetDescription>
        </SheetHeader>
        <TaxSettingsPanel
          workspaceId={workspaceId}
          documentType={documentType}
          documentId={documentId}
          hargaJual={hargaJual}
          settings={settings}
          editable={editable}
        />
      </SheetContent>
    </Sheet>
  );
}
