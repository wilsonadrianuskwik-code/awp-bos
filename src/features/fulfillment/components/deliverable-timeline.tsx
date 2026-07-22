"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils/cn";
import { formatISODate, groupByWeek, type WeekGroup } from "@/features/fulfillment/date-utils";
import type { FulfillmentDeliverable } from "@/features/fulfillment/types-projects";
import type { WorkspaceMember } from "@/features/workspace/types";

type DeliverableTimelineProps = {
  deliverables: FulfillmentDeliverable[];
  members: WorkspaceMember[];
  onSelectDeliverable: (id: string) => void;
};

function memberLabel(members: WorkspaceMember[], userId: string | null): string | null {
  if (!userId) return null;
  const m = members.find((x) => x.user_id === userId);
  return m?.profile?.full_name ?? m?.email ?? null;
}

function formatWeekLabel(weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(weekStart)} – ${fmt(weekEnd)}`;
}

// Rail visual (dot + connecting line) reused verbatim from
// FulfillmentProgressCard's delivery-history section, so Tracker's history
// and this workspace-wide timeline read as the same visual language rather
// than two different chronological-list treatments.
function TimelineRow({
  deliverable,
  members,
  isLast,
  onSelectDeliverable,
}: {
  deliverable: FulfillmentDeliverable;
  members: WorkspaceMember[];
  isLast: boolean;
  onSelectDeliverable: (id: string) => void;
}) {
  const assignee = memberLabel(members, deliverable.assigned_to);
  const dotTone =
    deliverable.status === "posted"
      ? "bg-emerald-500"
      : deliverable.status === "cancelled"
        ? "bg-red-500"
        : deliverable.status === "in_progress"
          ? "bg-blue-500"
          : "bg-amber-500";

  return (
    <button
      type="button"
      onClick={() => onSelectDeliverable(deliverable.id)}
      className="flex w-full gap-3 text-left"
    >
      <div className="flex w-3 flex-col items-center">
        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dotTone)} />
        {!isLast && <span className="w-0.5 flex-1 bg-border" />}
      </div>
      <div className="flex flex-1 items-start justify-between gap-2 pb-4">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium">{deliverable.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">{deliverable.scheduled_date}</span>
            {deliverable.tracker_description && <span>· {deliverable.tracker_description}</span>}
            {assignee && <span>· {assignee}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {deliverable.is_overdue && <StatusBadge status="overdue" className="text-[10px]" />}
          <StatusBadge status={deliverable.status} className="text-[10px]" />
        </div>
      </div>
    </button>
  );
}

function WeekSection({
  group,
  members,
  onSelectDeliverable,
}: {
  group: WeekGroup<FulfillmentDeliverable>;
  members: WorkspaceMember[];
  onSelectDeliverable: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {formatWeekLabel(group.weekStart)}
      </div>
      <div className="flex flex-col">
        {group.items.map((d, i) => (
          <TimelineRow
            key={d.id}
            deliverable={d}
            members={members}
            isLast={i === group.items.length - 1}
            onSelectDeliverable={onSelectDeliverable}
          />
        ))}
      </div>
    </div>
  );
}

// Timeline v1: a chronological read of the schedule, not a Gantt chart —
// Upcoming (scheduled, ascending) and Completed (posted, by when it was
// actually posted) are each grouped into week sections using the same
// dot+line rail already established by FulfillmentProgressCard's own
// delivery history. Cancelled items are real but rarely the thing someone's
// scanning for, so they're tucked behind a toggle instead of cluttering the
// primary "what's next / what's done" read.
export function DeliverableTimeline({
  deliverables,
  members,
  onSelectDeliverable,
}: DeliverableTimelineProps) {
  const [showCancelled, setShowCancelled] = useState(false);

  const upcomingGroups = useMemo(() => {
    const upcoming = deliverables
      .filter((d) => d.status === "scheduled" || d.status === "in_progress")
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
    return groupByWeek(upcoming, (d) => d.scheduled_date);
  }, [deliverables]);

  const completedGroups = useMemo(() => {
    const completed = deliverables
      .filter((d) => d.status === "posted")
      .sort((a, b) => (a.posted_at ?? a.scheduled_date).localeCompare(b.posted_at ?? b.scheduled_date));
    return groupByWeek(completed, (d) => (d.posted_at ? formatISODate(new Date(d.posted_at)) : d.scheduled_date));
  }, [deliverables]);

  const cancelled = useMemo(
    () =>
      deliverables
        .filter((d) => d.status === "cancelled")
        .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)),
    [deliverables]
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold">Upcoming</h3>
        {upcomingGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
        ) : (
          <div className="space-y-4">
            {upcomingGroups.map((group) => (
              <WeekSection
                key={group.weekStart.toISOString()}
                group={group}
                members={members}
                onSelectDeliverable={onSelectDeliverable}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">Completed</h3>
        {completedGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing posted yet.</p>
        ) : (
          <div className="space-y-4">
            {completedGroups.map((group) => (
              <WeekSection
                key={group.weekStart.toISOString()}
                group={group}
                members={members}
                onSelectDeliverable={onSelectDeliverable}
              />
            ))}
          </div>
        )}
      </div>

      {cancelled.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowCancelled((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", showCancelled && "rotate-90")} />
            Cancelled ({cancelled.length})
          </button>
          {showCancelled && (
            <div className="mt-3 flex flex-col">
              {cancelled.map((d, i) => (
                <TimelineRow
                  key={d.id}
                  deliverable={d}
                  members={members}
                  isLast={i === cancelled.length - 1}
                  onSelectDeliverable={onSelectDeliverable}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
