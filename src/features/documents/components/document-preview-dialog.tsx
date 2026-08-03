"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  SimplePrintView,
  type PrintLine,
  type PrintParty,
  type PrintTotalRow,
} from "@/features/documents/components/simple-print-view";
import type { DocumentMetaField } from "@/features/documents/components/document-shell";
import type {
  BrandingSettings,
  CompanyProfile,
  PaymentDetails,
} from "@/features/templates/types";

type DocumentPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceName: string;
  logoUrl?: string | null;
  companyProfile?: CompanyProfile;
  branding?: BrandingSettings;
  paymentDetails?: PaymentDetails;
  documentLabel: string;
  party: PrintParty;
  meta: DocumentMetaField[];
  lines: PrintLine[];
  showPricing?: boolean;
  totalRows?: PrintTotalRow[];
  total?: { label: string; value: string };
  notes?: string | null;
  terms?: string | null;
  showSignature?: boolean;
};

/**
 * The builder's Preview: the real printed document, on screen.
 *
 * Renders SimplePrintView — the same component, shell, table and footnote
 * the document actually prints through — rather than a styled
 * approximation. That is the whole point of it: a preview built from
 * different markup is a second layout to keep in sync, and the moment it
 * drifts it is worse than no preview at all, because it is confidently
 * wrong.
 *
 * Sized to A4's aspect: the page is 210mm wide, so the sheet is given a
 * fixed 794px (210mm at 96dpi) and the dialog scrolls it, instead of
 * letting the document reflow to whatever width the dialog happens to be
 * and showing a line-break pattern the paper won't have.
 */
export function DocumentPreviewDialog({
  open,
  onOpenChange,
  ...printProps
}: DocumentPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[860px] overflow-y-auto bg-muted p-6">
        <DialogTitle className="sr-only">Document preview</DialogTitle>
        <div className="mx-auto w-[794px] max-w-full origin-top bg-white p-[38px] shadow-lg">
          <SimplePrintView {...printProps} onScreen />
        </div>
      </DialogContent>
    </Dialog>
  );
}
