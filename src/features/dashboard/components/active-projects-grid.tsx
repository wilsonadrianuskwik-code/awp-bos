import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Building2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { ProjectHealthCard } from "@/features/dashboard/queries";

function HealthSegment({ label, value, currency }: { label: string; value: number; currency: string }) {
  const filled = value > 0;
  return (
    <div className="min-w-0">
      <div
        className={
          filled
            ? "h-1.5 rounded-full bg-primary"
            : "h-1.5 rounded-full bg-muted"
        }
      />
      <div className="mt-1 truncate text-[11px] text-muted-foreground">{label}</div>
      <div className="truncate text-[13px] font-medium tabular-nums">
        {filled ? formatCurrency(value, currency) : "—"}
      </div>
    </div>
  );
}

/**
 * The command-center dashboard's centerpiece — a portfolio-of-projects
 * view replacing the CRM's single revenue-hero number. This is the
 * concrete "reads as construction ERP, not CRM with new labels" moment
 * (master plan §8.3).
 */
export function ActiveProjectsGrid({
  projects,
  workspaceSlug,
}: {
  projects: ProjectHealthCard[];
  workspaceSlug: string;
}) {
  if (projects.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No active projects yet"
        description="Create a project to start tracking quotations, invoices, purchase orders, and deliveries in one place."
        action={
          <Button asChild size="sm">
            <Link href={`/${workspaceSlug}/projects/new`}>New Project</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => (
        <Link
          key={project.id}
          href={`/${workspaceSlug}/projects/${project.id}`}
          className="group rounded-lg border bg-card p-4 shadow-2xs transition-colors hover:bg-muted/40"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-mono text-[13px] font-semibold tabular-nums">{project.code}</div>
              <div className="truncate text-[13px] text-muted-foreground">{project.name}</div>
            </div>
            <StatusBadge status={project.status} />
          </div>
          {project.clientName && (
            <div className="mt-1 truncate text-[12px] text-muted-foreground">{project.clientName}</div>
          )}
          <div className="mt-3 grid grid-cols-3 gap-3">
            <HealthSegment label="Quoted" value={project.health.quoted_total} currency={project.currency} />
            <HealthSegment label="Invoiced" value={project.health.invoiced_total} currency={project.currency} />
            <HealthSegment label="Paid" value={project.health.paid_total} currency={project.currency} />
          </div>
        </Link>
      ))}
    </div>
  );
}
