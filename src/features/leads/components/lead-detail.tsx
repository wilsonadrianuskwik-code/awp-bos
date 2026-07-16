"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { deleteLead } from "@/features/leads/actions";
import { BackButton } from "@/components/shared/back-button";
import type { Lead } from "@/features/leads/types";
import type { Activity } from "@/features/activities/types";

type LeadDetailProps = {
  lead: Lead;
  activities: Activity[];
  onConvert: () => void;
};

export function LeadDetail({ lead, activities, onConvert }: LeadDetailProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();

  function handleDelete() {
    if (!confirm("Are you sure you want to delete this lead?")) return;

    startTransition(async () => {
      const result = await deleteLead(workspace.id, lead.id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Lead deleted", "success");
      router.push(`/${workspace.slug}/leads`);
    });
  }

  const canConvert = lead.status !== "won" && lead.status !== "lost";

  return (
    <div className="space-y-6">
      <BackButton href={`/${workspace.slug}/leads`} label="Back to Leads" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{lead.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={lead.status} />
            {lead.company && (
              <span className="text-sm text-muted-foreground">
                {lead.company}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {canConvert && (
            <Button variant="outline" onClick={onConvert}>
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              Convert to Client
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href={`/${workspace.slug}/leads/${lead.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <DetailItem label="Email" value={lead.email} />
                <DetailItem label="Phone" value={lead.phone} />
                <DetailItem label="Company" value={lead.company} />
                <DetailItem
                  label="Source"
                  value={lead.source?.replace(/_/g, " ")}
                />
                <DetailItem
                  label="Expected Value"
                  value={
                    lead.expected_value != null
                      ? new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: lead.expected_currency || "USD",
                        }).format(lead.expected_value)
                      : null
                  }
                />
                <DetailItem
                  label="Conversion Probability"
                  value={
                    lead.conversion_probability != null
                      ? `${lead.conversion_probability}%`
                      : null
                  }
                />
              </dl>
            </CardContent>
          </Card>

          {lead.notes_text && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{lead.notes_text}</p>
              </CardContent>
            </Card>
          )}

          {lead.converted_client_id && (
            <Card>
              <CardHeader>
                <CardTitle>Conversion</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  This lead was converted to a client on{" "}
                  {lead.converted_at
                    ? new Date(lead.converted_at).toLocaleDateString()
                    : "unknown date"}
                  .
                </p>
                <Button variant="link" className="mt-2 p-0" asChild>
                  <Link
                    href={`/${workspace.slug}/clients/${lead.converted_client_id}`}
                  >
                    View Client
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline activities={activities} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{value || "-"}</dd>
    </div>
  );
}
