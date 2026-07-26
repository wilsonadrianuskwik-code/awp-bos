"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { updateDefaultTerms } from "@/features/templates/actions";
import { defaultTermsSchema } from "@/features/templates/validators";
import type { DefaultTerms } from "@/features/templates/types";

type DefaultTermsFormProps = {
  workspaceId: string;
  defaultTerms: DefaultTerms;
};

export function DefaultTermsForm({ workspaceId, defaultTerms }: DefaultTermsFormProps) {
  const router = useRouter();
  const { can } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const canEdit = can("admin");

  const [invoicePaymentTerms, setInvoicePaymentTerms] = useState(
    defaultTerms.invoice_payment_terms ?? ""
  );
  const [invoiceNotes, setInvoiceNotes] = useState(defaultTerms.invoice_notes ?? "");
  const [quotationTerms, setQuotationTerms] = useState(
    defaultTerms.quotation_terms_and_conditions ?? ""
  );
  const [quotationNotes, setQuotationNotes] = useState(defaultTerms.quotation_notes ?? "");

  function handleSave() {
    const input = {
      invoice_payment_terms: invoicePaymentTerms,
      invoice_notes: invoiceNotes,
      quotation_terms_and_conditions: quotationTerms,
      quotation_notes: quotationNotes,
    };

    const parsed = defaultTermsSchema.safeParse(input);
    if (!parsed.success) {
      toast(parsed.error.issues[0].message, "error");
      return;
    }

    startTransition(async () => {
      const result = await updateDefaultTerms(workspaceId, parsed.data);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Default terms updated", "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoice Defaults</CardTitle>
          <CardDescription>
            Auto-fills on every new invoice. Editing an existing invoice keeps
            its own saved values.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Payment Terms</Label>
            <Input
              value={invoicePaymentTerms}
              onChange={(e) => setInvoicePaymentTerms(e.target.value)}
              disabled={!canEdit}
              placeholder="e.g. Net 30 days"
            />
          </div>
          <div className="space-y-2">
            <Label>Default Notes</Label>
            <Textarea
              value={invoiceNotes}
              onChange={(e) => setInvoiceNotes(e.target.value)}
              disabled={!canEdit}
              placeholder="e.g. Barang yang sudah dibeli tidak dapat dikembalikan"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quotation Defaults</CardTitle>
          <CardDescription>
            Auto-fills on every new quotation. Editing an existing quotation
            keeps its own saved values.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Terms & Conditions</Label>
            <Textarea
              value={quotationTerms}
              onChange={(e) => setQuotationTerms(e.target.value)}
              disabled={!canEdit}
              placeholder="e.g. This quotation is valid for 30 days from the issue date."
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <Label>Default Notes</Label>
            <Textarea
              value={quotationNotes}
              onChange={(e) => setQuotationNotes(e.target.value)}
              disabled={!canEdit}
              placeholder="e.g. Please contact us with any questions."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {canEdit && (
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
      )}
    </div>
  );
}
