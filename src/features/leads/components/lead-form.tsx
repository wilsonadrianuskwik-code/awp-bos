"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

      toast(
        isEditing ? "Lead updated successfully" : "Lead created successfully",
        "success"
      );
      router.push(`/${workspace.slug}/leads`);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? "Edit Lead" : "New Lead"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                name="name"
                defaultValue={lead?.name ?? ""}
                required
                maxLength={255}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={lead?.email ?? ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                defaultValue={lead?.phone ?? ""}
                maxLength={50}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                name="company"
                defaultValue={lead?.company ?? ""}
                maxLength={255}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="conversion_probability">
                Conversion Probability (%)
              </Label>
              <Input
                id="conversion_probability"
                name="conversion_probability"
                type="number"
                min={0}
                max={100}
                defaultValue={lead?.conversion_probability ?? ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expected_value">Expected Value</Label>
              <Input
                id="expected_value"
                name="expected_value"
                type="number"
                min={0}
                step="0.01"
                defaultValue={lead?.expected_value ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes_text">Notes</Label>
            <Textarea
              id="notes_text"
              name="notes_text"
              rows={4}
              defaultValue={lead?.notes_text ?? ""}
            />
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={isPending}>
              {isPending
                ? isEditing
                  ? "Updating..."
                  : "Creating..."
                : isEditing
                  ? "Update Lead"
                  : "Create Lead"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
