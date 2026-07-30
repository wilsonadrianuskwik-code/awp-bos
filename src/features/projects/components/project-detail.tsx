"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/shared/status-badge";
import { DetailHeader } from "@/components/shared/detail-header";
import { FieldList, DetailItem } from "@/components/shared/detail-item";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { ProjectHealthStrip } from "@/features/projects/components/project-health-strip";
import { ProjectDocumentsTable } from "@/features/projects/components/project-documents-table";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { useConfirm } from "@/providers/confirm-provider";
import { deleteProject } from "@/features/projects/actions";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { Project, ProjectHealth } from "@/features/projects/types";
import type { ProjectDocument } from "@/features/projects/queries";
import type { Activity } from "@/features/activities/types";
import type { Client } from "@/features/clients/types";
import { formatDate } from "@/lib/utils/date";

type ProjectDetailProps = {
  project: Project;
  client: Client | null;
  activities: Activity[];
  documents: ProjectDocument[];
  health: ProjectHealth;
};

function formatAddress(address: Project["site_address"]) {
  if (!address) return null;
  return [address.line1, address.city, address.state, address.postal_code, address.country]
    .filter(Boolean)
    .join(", ");
}

export function ProjectDetail({
  project,
  client,
  activities,
  documents,
  health,
}: ProjectDetailProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete this project?",
      description: "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    startTransition(async () => {
      const result = await deleteProject(workspace.id, project.id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Project deleted", "success");
      router.push(`/${workspace.slug}/projects`);
    });
  }

  return (
    <div className="space-y-6">
      <DetailHeader
        backHref={`/${workspace.slug}/projects`}
        backLabel="Back to Projects"
        title={project.name}
        badges={<StatusBadge status={project.status} />}
        subtitle={
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-xs">{project.code}</span>
            {client && <span>· {client.name}</span>}
          </span>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/${workspace.slug}/projects/${project.id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Health</CardTitle>
            </CardHeader>
            <CardContent>
              <ProjectHealthStrip health={health} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Project Details</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldList>
                <DetailItem label="Code" value={project.code} />
                <DetailItem label="Client" value={client?.name} />
                <DetailItem
                  label="Status"
                  value={project.status.replace(/_/g, " ")}
                />
                <DetailItem
                  label="Budget"
                  value={
                    project.budget != null
                      ? formatCurrency(project.budget)
                      : null
                  }
                />
                <DetailItem
                  label="Start Date"
                  value={
                    project.start_date
                      ? formatDate(project.start_date)
                      : null
                  }
                />
                <DetailItem
                  label="End Date"
                  value={
                    project.end_date
                      ? formatDate(project.end_date)
                      : null
                  }
                />
                <DetailItem label="Site Address" value={formatAddress(project.site_address)} />
              </FieldList>
              {project.notes && (
                <div className="mt-4 border-t pt-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Notes
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{project.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Linked Documents</CardTitle>
              {/* Same documents, in the workspace-wide view with the
                  project filter already applied — so you can widen to
                  other projects or narrow to one type from there. */}
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/${workspace.slug}/documents?project=${project.id}`}
                >
                  Open in Documents
                  <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              <ProjectDocumentsTable documents={documents} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financials">
          <Card>
            <CardHeader>
              <CardTitle>Financial Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldList>
                <DetailItem
                  label="Quoted Total"
                  value={formatCurrency(health.quoted_total)}
                />
                <DetailItem
                  label="Invoiced Total"
                  value={formatCurrency(health.invoiced_total)}
                />
                <DetailItem
                  label="Paid Total"
                  value={formatCurrency(health.paid_total)}
                />
                <DetailItem
                  label="Outstanding"
                  value={formatCurrency(Math.max(0, health.invoiced_total - health.paid_total))}
                />
                <DetailItem
                  label="Deliveries"
                  value={`${health.delivered_count} of ${health.delivery_total} delivered`}
                />
              </FieldList>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline activities={activities} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
