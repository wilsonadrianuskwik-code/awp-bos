"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FormSection,
  FormGrid,
  FieldGroup,
  FormActions,
} from "@/components/shared/form";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { createSupplierAction, updateSupplier } from "@/features/suppliers/actions";
import type { Supplier } from "@/features/suppliers/types";

type SupplierFormProps = {
  supplier?: Supplier;
};

export function SupplierForm({ supplier }: SupplierFormProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();

  const isEditing = !!supplier;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = isEditing
        ? await updateSupplier(workspace.id, supplier.id, formData)
        : await createSupplierAction(workspace.id, formData);

      if (result.error) {
        toast(result.error, "error");
        return;
      }

      toast(isEditing ? "Supplier updated" : "Supplier created", "success");
      router.push(`/${workspace.slug}/suppliers`);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-6">
        <FormSection title={isEditing ? "Edit Supplier" : "New Supplier"}>
          <FormGrid>
            <FieldGroup label="Name" htmlFor="name" required>
              <Input id="name" name="name" defaultValue={supplier?.name ?? ""} required maxLength={255} />
            </FieldGroup>

            <FieldGroup label="Company" htmlFor="company">
              <Input id="company" name="company" defaultValue={supplier?.company ?? ""} maxLength={255} />
            </FieldGroup>

            <FieldGroup label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" defaultValue={supplier?.email ?? ""} />
            </FieldGroup>

            <FieldGroup label="Phone" htmlFor="phone">
              <Input id="phone" name="phone" defaultValue={supplier?.phone ?? ""} maxLength={50} />
            </FieldGroup>

            <FieldGroup label="Website" htmlFor="website">
              <Input id="website" name="website" type="url" defaultValue={supplier?.website ?? ""} placeholder="https://" />
            </FieldGroup>

            <FieldGroup label="Billing Email" htmlFor="billing_email">
              <Input id="billing_email" name="billing_email" type="email" defaultValue={supplier?.billing_email ?? ""} />
            </FieldGroup>

            <FieldGroup label="Tax ID" htmlFor="tax_id">
              <Input id="tax_id" name="tax_id" defaultValue={supplier?.tax_id ?? ""} maxLength={50} />
            </FieldGroup>
          </FormGrid>
        </FormSection>

        <FormSection title="Billing Preferences">
          <FormGrid>
            <FieldGroup label="Payment Terms (days)" htmlFor="payment_terms">
              <Input
                id="payment_terms"
                name="payment_terms"
                type="number"
                min={0}
                max={365}
                defaultValue={supplier?.payment_terms ?? 30}
              />
            </FieldGroup>

          </FormGrid>
        </FormSection>

        <FormSection
          title="Address"
          description="Where this supplier is based."
        >
          <FormGrid>
            <FieldGroup label="Address Line 1" htmlFor="address_line1" className="sm:col-span-2">
              <Input
                id="address_line1"
                name="address_line1"
                defaultValue={supplier?.address?.line1 ?? ""}
              />
            </FieldGroup>

            <FieldGroup label="City" htmlFor="address_city">
              <Input id="address_city" name="address_city" defaultValue={supplier?.address?.city ?? ""} />
            </FieldGroup>

            <FieldGroup label="State / Province" htmlFor="address_state">
              <Input id="address_state" name="address_state" defaultValue={supplier?.address?.state ?? ""} />
            </FieldGroup>

            <FieldGroup label="Postal Code" htmlFor="address_postal_code">
              <Input
                id="address_postal_code"
                name="address_postal_code"
                defaultValue={supplier?.address?.postal_code ?? ""}
              />
            </FieldGroup>

            <FieldGroup label="Country" htmlFor="address_country">
              <Input id="address_country" name="address_country" defaultValue={supplier?.address?.country ?? ""} />
            </FieldGroup>
          </FormGrid>
        </FormSection>

        <FormSection title="Notes">
          <FieldGroup label="Notes" htmlFor="notes">
            <Textarea id="notes" name="notes" rows={4} defaultValue={supplier?.notes ?? ""} maxLength={5000} />
          </FieldGroup>
        </FormSection>

        <FormActions>
          <Button type="submit" loading={isPending}>
            {isEditing ? "Update Supplier" : "Create Supplier"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </FormActions>
      </div>
    </form>
  );
}
