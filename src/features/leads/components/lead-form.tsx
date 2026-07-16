"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { createLead, updateLead } from "@/features/leads/actions";
import { LEAD_STATUSES, LEAD_SOURCES, type Lead } from "@/features/leads/types";

type LeadFormProps = {
  lead?: Lead;
};

export function LeadForm({ lead }: LeadFormProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();

  const isEditing = !!lead;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = isEditing
        ? await updateLead(workspace.id, lead.id, formData)
        : await createLead(workspace.id, formData);

      if (result.error) {
        toast(result.error, "error");
        return;
      }

      toast(isEditing ? "Lead updated" : "Lead created", "success");
      router.push(`/${workspace.slug}/leads`);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <FormSection title={isEditing ? "Edit Lead" : "New Lead"}>
        <FormGrid>
          <FieldGroup label="Name" htmlFor="name" required>
            <Input id="name" name="name" defaultValue={lead?.name ?? ""} required maxLength={255} />
          </FieldGroup>

          <FieldGroup label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" defaultValue={lead?.email ?? ""} />
          </FieldGroup>

          <FieldGroup label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" defaultValue={lead?.phone ?? ""} maxLength={50} />
          </FieldGroup>

          <FieldGroup label="Company" htmlFor="company">
            <Input id="company" name="company" defaultValue={lead?.company ?? ""} maxLength={255} />
          </FieldGroup>

          <FieldGroup label="Source" htmlFor="source">
            <Select name="source" defaultValue={lead?.source ?? ""}>
              <SelectTrigger id="source">
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldGroup>

          <FieldGroup label="Status" htmlFor="status">
            <Select name="status" defaultValue={lead?.status ?? "new"}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldGroup>

          <FieldGroup label="Conversion Probability (%)" htmlFor="conversion_probability">
            <Input
              id="conversion_probability"
              name="conversion_probability"
              type="number"
              min={0}
              max={100}
              defaultValue={lead?.conversion_probability ?? ""}
            />
          </FieldGroup>

          <FieldGroup label="Expected Value" htmlFor="expected_value">
            <Input
              id="expected_value"
              name="expected_value"
              type="number"
              min={0}
              step="0.01"
              defaultValue={lead?.expected_value ?? ""}
            />
          </FieldGroup>
        </FormGrid>

        <FieldGroup label="Notes" htmlFor="notes_text">
          <Textarea id="notes_text" name="notes_text" rows={4} defaultValue={lead?.notes_text ?? ""} />
        </FieldGroup>

        <FormActions>
          <Button type="submit" loading={isPending}>
            {isEditing ? "Update Lead" : "Create Lead"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </FormActions>
      </FormSection>
    </form>
  );
}
