"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormSection, FormGrid, FieldGroup, FormActions } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createDeliveryOrder } from "@/features/delivery-orders/actions";
import {
  DeliveryAddressField,
  toDeliveryAddress,
  type AddressSuggestion,
} from "@/features/delivery-orders/components/delivery-address-field";
import { formatAddress, type PostalAddress } from "@/features/documents/address";

type InvoiceOption = {
  id: string;
  invoice_number: string;
  client_name: string | null;
  client_address: PostalAddress;
  project_label: string | null;
  site_address: PostalAddress;
};

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
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = invoices.find((inv) => inv.id === invoiceId);
  const suggestions: AddressSuggestion[] = selected
    ? [
        ...(selected.site_address
          ? [{
              label: selected.project_label
                ? `Project site — ${selected.project_label}`
                : "Project site",
              address: selected.site_address,
            }]
          : []),
        ...(selected.client_address
          ? [{
              label: selected.client_name
                ? `Client — ${selected.client_name}`
                : "Client address",
              address: selected.client_address,
            }]
          : []),
      ]
    : [];

  // Picking an invoice prefills the project's site address, since that's
  // the destination in most cases. Only ever fills a blank box — never
  // overwrites an address the user has already typed.
  function handleInvoiceChange(nextInvoiceId: string) {
    setInvoiceId(nextInvoiceId);
    if (deliveryAddress.trim() !== "") return;
    const next = invoices.find((inv) => inv.id === nextInvoiceId);
    const prefill = formatAddress(next?.site_address ?? null);
    if (prefill) setDeliveryAddress(prefill);
  }

  function handleSubmit() {
    if (!invoiceId) {
      setError("Select an invoice");
      return;
    }
    startTransition(async () => {
      const result = await createDeliveryOrder(workspaceId, {
        invoice_id: invoiceId,
        delivery_date: deliveryDate || null,
        delivery_address: toDeliveryAddress(deliveryAddress),
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
          <Select value={invoiceId} onValueChange={handleInvoiceChange}>
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
      <FieldGroup
        label="Deliver To"
        hint="Defaults to the project site. Leave blank to use the client's address."
      >
        <DeliveryAddressField
          value={deliveryAddress}
          onChange={setDeliveryAddress}
          suggestions={suggestions}
        />
      </FieldGroup>
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
