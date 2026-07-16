"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FormSection,
  FormGrid,
  FieldGroup,
  FormActions,
} from "@/components/shared/form";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { createClientAction, updateClient } from "@/features/clients/actions";
import { CURRENCY_MODES } from "@/features/clients/validators";
import type { Client } from "@/features/clients/types";

// Same list used by the quotation/invoice builders and workspace profile —
// kept as a local const per this codebase's existing convention rather than
// a shared module (see those files for the sibling copies).
const CURRENCIES = ["IDR", "USD", "EUR", "GBP", "SGD", "MYR", "AUD", "CAD"];

type ClientFormProps = {
  client?: Client;
};

export function ClientForm({ client }: ClientFormProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();

  const isEditing = !!client;

  const [currencyMode, setCurrencyMode] = useState<(typeof CURRENCY_MODES)[number]>(
    client?.preferred_currency ? "custom" : "workspace_default"
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = isEditing
        ? await updateClient(workspace.id, client.id, formData)
        : await createClientAction(workspace.id, formData);

      if (result.error) {
        toast(result.error, "error");
        return;
      }

      toast(
        isEditing ? "Client updated" : "Client created",
        "success"
      );
      router.push(`/${workspace.slug}/clients`);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-6">
        <FormSection title={isEditing ? "Edit Client" : "New Client"}>
          <FormGrid>
            <FieldGroup label="Name" htmlFor="name" required>
              <Input id="name" name="name" defaultValue={client?.name ?? ""} required maxLength={255} />
            </FieldGroup>

            <FieldGroup label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" defaultValue={client?.email ?? ""} />
            </FieldGroup>

            <FieldGroup label="Phone" htmlFor="phone">
              <Input id="phone" name="phone" defaultValue={client?.phone ?? ""} maxLength={50} />
            </FieldGroup>

            <FieldGroup label="Company" htmlFor="company">
              <Input id="company" name="company" defaultValue={client?.company ?? ""} maxLength={255} />
            </FieldGroup>

            <FieldGroup label="Website" htmlFor="website">
              <Input id="website" name="website" type="url" defaultValue={client?.website ?? ""} placeholder="https://" />
            </FieldGroup>

            <FieldGroup label="Billing Email" htmlFor="billing_email">
              <Input id="billing_email" name="billing_email" type="email" defaultValue={client?.billing_email ?? ""} />
            </FieldGroup>

            <FieldGroup label="Tax ID" htmlFor="tax_id">
              <Input id="tax_id" name="tax_id" defaultValue={client?.tax_id ?? ""} maxLength={50} />
            </FieldGroup>
          </FormGrid>
        </FormSection>

        <FormSection
          title="Billing Preferences"
          description="How this client is billed. More preferences (tax settings, etc.) will appear here in future."
        >
          <FormGrid>
            <FieldGroup label="Payment Terms (days)" htmlFor="payment_terms">
              <Input
                id="payment_terms"
                name="payment_terms"
                type="number"
                min={0}
                max={365}
                defaultValue={client?.payment_terms ?? 30}
              />
            </FieldGroup>

            <FieldGroup label="Currency" htmlFor="currency_mode">
              <Select
                name="currency_mode"
                value={currencyMode}
                onValueChange={(v) => setCurrencyMode(v as (typeof CURRENCY_MODES)[number])}
              >
                <SelectTrigger id="currency_mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="workspace_default">
                    Use workspace default ({workspace.default_currency})
                  </SelectItem>
                  <SelectItem value="custom">Custom currency</SelectItem>
                </SelectContent>
              </Select>
            </FieldGroup>

            {currencyMode === "custom" && (
              <FieldGroup
                label="Preferred Currency"
                htmlFor="preferred_currency"
                required
                hint="New quotations and invoices for this client will default to this currency."
              >
                <Select
                  name="preferred_currency"
                  defaultValue={client?.preferred_currency ?? workspace.default_currency}
                >
                  <SelectTrigger id="preferred_currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldGroup>
            )}
          </FormGrid>
        </FormSection>

        <FormActions>
          <Button type="submit" loading={isPending}>
            {isEditing ? "Update Client" : "Create Client"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </FormActions>
      </div>
    </form>
  );
}
