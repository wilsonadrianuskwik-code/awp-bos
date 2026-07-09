"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { deleteClient } from "@/features/clients/actions";
import type { Client } from "@/features/clients/types";
import type { Activity } from "@/features/activities/types";

type ClientDetailProps = {
  client: Client;
  activities: Activity[];
};

export function ClientDetail({ client, activities }: ClientDetailProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();

  function handleDelete() {
    if (!confirm("Are you sure you want to delete this client?")) return;

    startTransition(async () => {
      const result = await deleteClient(workspace.id, client.id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Client deleted", "success");
      router.push(`/${workspace.slug}/clients`);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
          {client.company && (
            <p className="mt-1 text-muted-foreground">{client.company}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/${workspace.slug}/clients/${client.id}/edit`}>
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
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <DetailItem label="Email" value={client.email} />
                <DetailItem label="Phone" value={client.phone} />
                <DetailItem label="Company" value={client.company} />
                <DetailItem label="Website" value={client.website} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Billing</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <DetailItem
                  label="Billing Email"
                  value={client.billing_email}
                />
                <DetailItem label="Tax ID" value={client.tax_id} />
                <DetailItem
                  label="Payment Terms"
                  value={`${client.payment_terms} days`}
                />
                <DetailItem
                  label="Preferred Currency"
                  value={client.preferred_currency}
                />
              </dl>
            </CardContent>
          </Card>

          {client.source_lead_id && (
            <Card>
              <CardHeader>
                <CardTitle>Origin</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Converted from a lead.
                </p>
                <Button variant="link" className="mt-1 p-0" asChild>
                  <Link
                    href={`/${workspace.slug}/leads/${client.source_lead_id}`}
                  >
                    View Original Lead
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
