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
import { createProjectAction, updateProject } from "@/features/projects/actions";
import { PROJECT_STATUSES } from "@/features/projects/types";
import type { Project } from "@/features/projects/types";
import type { Client } from "@/features/clients/types";
import type { WorkspaceMember } from "@/features/workspace/types";

type ProjectFormProps = {
  project?: Project;
  clients: Client[];
  members: WorkspaceMember[];
};

export function ProjectForm({ project, clients, members }: ProjectFormProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();

  const isEditing = !!project;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = isEditing
        ? await updateProject(workspace.id, project.id, formData)
        : await createProjectAction(workspace.id, formData);

      if (result.error) {
        toast(result.error, "error");
        return;
      }

      toast(isEditing ? "Project updated" : "Project created", "success");
      router.push(`/${workspace.slug}/projects`);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-6">
        <FormSection title={isEditing ? "Edit Project" : "New Project"}>
          <FormGrid>
            <FieldGroup label="Code" htmlFor="code" required>
              <Input
                id="code"
                name="code"
                defaultValue={project?.code ?? ""}
                required
                maxLength={100}
              />
            </FieldGroup>

            <FieldGroup label="Name" htmlFor="name" required>
              <Input
                id="name"
                name="name"
                defaultValue={project?.name ?? ""}
                required
                maxLength={255}
              />
            </FieldGroup>

            <FieldGroup label="Client" htmlFor="client_id">
              <Select name="client_id" defaultValue={project?.client_id ?? ""}>
                <SelectTrigger id="client_id">
                  <SelectValue placeholder="No client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldGroup>

            <FieldGroup label="Status" htmlFor="status">
              <Select name="status" defaultValue={project?.status ?? "planning"}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldGroup>

            <FieldGroup label="Start Date" htmlFor="start_date">
              <Input
                id="start_date"
                name="start_date"
                type="date"
                defaultValue={project?.start_date ?? ""}
              />
            </FieldGroup>

            <FieldGroup label="End Date" htmlFor="end_date">
              <Input
                id="end_date"
                name="end_date"
                type="date"
                defaultValue={project?.end_date ?? ""}
              />
            </FieldGroup>

            <FieldGroup label="Budget" htmlFor="budget">
              <Input
                id="budget"
                name="budget"
                type="number"
                min={0}
                step="0.01"
                defaultValue={project?.budget ?? ""}
              />
            </FieldGroup>

            <FieldGroup label="Assigned To" htmlFor="assigned_to">
              <Select name="assigned_to" defaultValue={project?.assigned_to ?? ""}>
                <SelectTrigger id="assigned_to">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.profile?.full_name ?? m.email ?? m.user_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldGroup>
          </FormGrid>
        </FormSection>

        <FormSection
          title="Site Address"
          description="Where the project is physically located."
        >
          <FormGrid>
            <FieldGroup label="Address Line 1" htmlFor="site_address_line1" className="sm:col-span-2">
              <Input
                id="site_address_line1"
                name="site_address_line1"
                defaultValue={project?.site_address?.line1 ?? ""}
              />
            </FieldGroup>

            <FieldGroup label="City" htmlFor="site_address_city">
              <Input
                id="site_address_city"
                name="site_address_city"
                defaultValue={project?.site_address?.city ?? ""}
              />
            </FieldGroup>

            <FieldGroup label="State / Province" htmlFor="site_address_state">
              <Input
                id="site_address_state"
                name="site_address_state"
                defaultValue={project?.site_address?.state ?? ""}
              />
            </FieldGroup>

            <FieldGroup label="Postal Code" htmlFor="site_address_postal_code">
              <Input
                id="site_address_postal_code"
                name="site_address_postal_code"
                defaultValue={project?.site_address?.postal_code ?? ""}
              />
            </FieldGroup>

            <FieldGroup label="Country" htmlFor="site_address_country">
              <Input
                id="site_address_country"
                name="site_address_country"
                defaultValue={project?.site_address?.country ?? ""}
              />
            </FieldGroup>
          </FormGrid>
        </FormSection>

        <FormSection title="Notes">
          <FieldGroup label="Notes" htmlFor="notes">
            <Textarea
              id="notes"
              name="notes"
              rows={4}
              defaultValue={project?.notes ?? ""}
              maxLength={5000}
            />
          </FieldGroup>
        </FormSection>

        <FormActions>
          <Button type="submit" loading={isPending}>
            {isEditing ? "Update Project" : "Create Project"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </FormActions>
      </div>
    </form>
  );
}
