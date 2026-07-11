"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { deleteClient } from "@/features/clients/actions";
import { getOverdueDays } from "@/lib/utils/date";
import type { Client } from "@/features/clients/types";
import type { Activity } from "@/features/activities/types";

// Deliberately local, not imported from the quotations feature — features
// only compose with each other through the app/ page layer.
type ClientQuotationSummary = {
  id: string;
  quotation_number: string;
  status: string;
  total: number;
  currency: string;
  created_at: string;
};

// Deliberately local, not imported from the invoices feature — same
// isolation rule as ClientQuotationSummary above.
type ClientInvoiceSummary = {
  id: string;
  invoice_number: string;
  status: string;
  total: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  due_date: string | null;
  created_at: string;
};

type ClientDetailProps = {
  client: Client;
  activities: Activity[];
  quotations: ClientQuotationSummary[];
  invoices: ClientInvoiceSummary[];
};

export function ClientDetail({
  client,
  activities,
  quotations,
  invoices,
}: ClientDetailProps) {
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Quotations</CardTitle>
              <div className="flex gap-2">
                {quotations.length > 0 && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link
                      href={`/${workspace.slug}/quotations?clientId=${client.id}`}
                    >
                      View All
                    </Link>
                  </Button>
                )}
                <Button size="sm" asChild>
                  <Link
                    href={`/${workspace.slug}/quotations/new?clientId=${client.id}`}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    New Quotation
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {quotations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    No quotations yet for this client.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {quotations.map((q) => (
                    <Link
                      key={q.id}
                      href={`/${workspace.slug}/quotations/${q.id}`}
                      className="flex items-center justify-between rounded-lg border p-3 text-sm transition-colors hover:bg-accent"
                    >
                      <div>
                        <p className="font-medium">{q.quotation_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(q.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums">
                          {new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: q.currency,
                          }).format(q.total)}
                        </span>
                        <StatusBadge status={q.status} />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Invoices</CardTitle>
              <div className="flex gap-2">
                {invoices.length > 0 && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link
                      href={`/${workspace.slug}/invoices?clientId=${client.id}`}
                    >
                      View All
                    </Link>
                  </Button>
                )}
                <Button size="sm" asChild>
                  <Link
                    href={`/${workspace.slug}/invoices/new?clientId=${client.id}`}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    New Invoice
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Receipt className="h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    No invoices yet for this client.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {invoices.map((inv) => (
                    <Link
                      key={inv.id}
                      href={`/${workspace.slug}/invoices/${inv.id}`}
                      className="flex items-center justify-between rounded-lg border p-3 text-sm transition-colors hover:bg-accent"
                    >
                      <div>
                        <p className="font-medium">{inv.invoice_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(inv.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="font-semibold tabular-nums">
                            {new Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: inv.currency,
                            }).format(inv.amount_due)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            of{" "}
                            {new Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: inv.currency,
                            }).format(inv.total)}
                          </p>
                        </div>
                        <StatusBadge
                          status={inv.status}
                          label={
                            inv.status === "overdue" && inv.due_date
                              ? `Overdue • ${getOverdueDays(inv.due_date)}d`
                              : undefined
                          }
                        />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
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
