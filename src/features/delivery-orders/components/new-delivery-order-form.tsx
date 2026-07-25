"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormSection, FormGrid, FieldGroup, FormActions } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createDeliveryOrder } from "@/features/delivery-orders/actions";

type InvoiceOption = { id: string; invoice_number: string; client_name: string | null };

export function NewDeliveryOrderForm({
  workspaceId,
  workspaceSlug,
  invoices,
}: {
  workspaceId: string;
  workspaceSlug: string;
  invoices: InvoiceOption[];
}) {
  const router = useRouter();
  const [invoiceId, setInvoiceId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!invoiceId) {
      setError("Select an invoice");
      return;
    }
    startTransition(async () => {
      const result = await createDeliveryOrder(workspaceId, {
        invoice_id: invoiceId,
        delivery_date: deliveryDate || null,
        notes: notes || null,
        line_items: [],
      });
      if (result.error) {
        setError(result.error);
      } else {
        router.push(`/${workspaceSlug}/delivery-orders/${result.data.id}`);
      }
    });
  }

  return (
    <FormSection title="New Delivery Order">
      <FormGrid>
        <FieldGroup label="Invoice" required>
          <Select value={invoiceId} onValueChange={setInvoiceId}>
            <SelectTrigger>
              <SelectValue placeholder="Select an invoice" />
            </SelectTrigger>
            <SelectContent>
              {invoices.map((inv) => (
                <SelectItem key={inv.id} value={inv.id}>
                  {inv.invoice_number} {inv.client_name ? `— ${inv.client_name}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldGroup>
        <FieldGroup label="Delivery Date">
          <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
        </FieldGroup>
      </FormGrid>
      <FieldGroup label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </FieldGroup>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <FormActions>
        <Button disabled={isPending} loading={isPending} onClick={handleSubmit}>
          Create Delivery Order
        </Button>
      </FormActions>
    </FormSection>
  );
}
