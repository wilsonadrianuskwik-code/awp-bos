"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FormSection,
  FormGrid,
  FieldGroup,
  FormActions,
} from "@/components/shared/form";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { createClientAction, updateClient } from "@/features/clients/actions";
import type { Client } from "@/features/clients/types";

type ClientFormProps = {
  client?: Client;
};

export function ClientForm({ client }: ClientFormProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();

  const isEditing = !!client;

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
        </FormGrid>

        <FormActions>
          <Button type="submit" loading={isPending}>
            {isEditing ? "Update Client" : "Create Client"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </FormActions>
      </FormSection>
    </form>
  );
}
