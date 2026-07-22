"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { cn } from "@/lib/utils/cn";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { updateFulfillmentProjectAction } from "@/features/fulfillment/actions-projects";
import {
  formatISODate,
  getMonthGridDays,
  groupByDateKey,
  isSameDay,
} from "@/features/fulfillment/date-utils";
import type {
  DeliverableStatus,
  FulfillmentDeliverable,
  FulfillmentProjectWithRollup,
} from "@/features/fulfillment/types-projects";
import type { Activity } from "@/features/activities/types";

const DOT_TONE: Record<DeliverableStatus, string> = {
  scheduled: "bg-amber-500",
  in_progress: "bg-blue-500",
  posted: "bg-emerald-500",
  cancelled: "bg-red-500",
};

const ACTIVITY_PREVIEW_COUNT = 6;

type WorkspaceSidebarProps = {
  project: FulfillmentProjectWithRollup;
  deliverables: FulfillmentDeliverable[];
  activities: Activity[];
  onSelectDeliverable: (id: string) => void;
  onOpenCalendar: () => void;
  onOpenTimeline: () => void;
  onRefresh: () => void;
};

// Persistent right rail — mirrors the reference mockup's always-visible
// Calendar/Upcoming/Notes/Activity panel instead of tucking that content
// behind a "Details" button. Every piece here is read-only-at-a-glance;
// clicking through (a day, an upcoming row, "View all") always lands on
// the same Calendar/Timeline tabs and DeliverableDetailSheet the rest of
// the workspace already uses — no separate editing surface invented here
// except Notes, which only ever lived in this slide-over/sidebar anyway.
export function WorkspaceSidebar({
  project,
  deliverables,
  activities,
  onSelectDeliverable,
  onOpenCalendar,
  onOpenTimeline,
  onRefresh,
}: WorkspaceSidebarProps) {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [anchor, setAnchor] = useState(() => new Date());
  const [notes, setNotes] = useState(project.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const router = useRouter();

  const byDate = useMemo(
    () => groupByDateKey(deliverables, (d) => d.scheduled_date),
    [deliverables]
  );

  const days = useMemo(
    () => getMonthGridDays(anchor.getFullYear(), anchor.getMonth()),
    [anchor]
  );
  const currentMonth = anchor.getMonth();
  const today = new Date();

  const upcoming = useMemo(
    () =>
      deliverables
        .filter((d) => d.status === "scheduled" || d.status === "in_progress")
        .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
        .slice(0, 5),
    [deliverables]
  );

  async function saveNotes() {
    if (notes === (project.notes ?? "")) return;
    setSavingNotes(true);
    const result = await updateFulfillmentProjectAction(workspace.id, project.id, {
      start_date: project.start_date ?? "",
      end_date: project.end_date ?? "",
      notes,
    });
    setSavingNotes(false);
    if (result.error) {
      toast(result.error, "error");
      return;
    }
    router.refresh();
    onRefresh();
  }

  const visibleActivities = showAllActivity ? activities : activities.slice(0, ACTIVITY_PREVIEW_COUNT);

  return (
    <div className="flex w-72 shrink-0 flex-col gap-4 xl:w-80">
      {/* Mini Calendar */}
      <div className="rounded-lg border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={onOpenCalendar}
            className="text-xs font-semibold hover:text-primary hover:underline"
          >
            {anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </button>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setAnchor((p) => new Date(p.getFullYear(), p.getMonth() - 1, 1))}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setAnchor((p) => new Date(p.getFullYear(), p.getMonth() + 1, 1))}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <span key={i} className="text-[10px] font-medium text-muted-foreground/70">
              {d}
            </span>
          ))}
          {days.map((day) => {
            const items = byDate.get(formatISODate(day)) ?? [];
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={onOpenCalendar}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded py-0.5 text-[11px] tabular-nums hover:bg-muted",
                  day.getMonth() !== currentMonth && "text-muted-foreground/40",
                  isSameDay(day, today) && "font-semibold text-primary"
                )}
              >
                {day.getDate()}
                <span className="flex h-1 gap-0.5">
                  {items.slice(0, 3).map((d, i) => (
                    <span key={i} className={cn("h-1 w-1 rounded-full", DOT_TONE[d.status])} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Upcoming Deliverables */}
      <div className="rounded-lg border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold">Upcoming Deliverables</h3>
          <button
            type="button"
            onClick={onOpenTimeline}
            className="text-[11px] text-muted-foreground hover:text-primary hover:underline"
          >
            View all
          </button>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing coming up.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {upcoming.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onSelectDeliverable(d.id)}
                className="flex items-center gap-2 text-left"
              >
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_TONE[d.status])} />
                <span className="w-14 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {d.scheduled_date}
                </span>
                <span className="truncate text-xs hover:text-primary hover:underline">{d.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="rounded-lg border bg-card p-3">
        <h3 className="mb-2 text-xs font-semibold">Notes</h3>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Campaign notes, tone guidelines, anything Operations needs..."
          maxLength={4000}
          rows={4}
          disabled={savingNotes}
          className="resize-none text-xs"
        />
      </div>

      {/* Activity Timeline */}
      <div className="rounded-lg border bg-card p-3">
        <h3 className="mb-2 text-xs font-semibold">Activity Timeline</h3>
        <ActivityTimeline activities={visibleActivities} />
        {activities.length > ACTIVITY_PREVIEW_COUNT && (
          <button
            type="button"
            onClick={() => setShowAllActivity((v) => !v)}
            className="mt-2 text-[11px] text-muted-foreground hover:text-primary hover:underline"
          >
            {showAllActivity ? "Show less" : `Show all ${activities.length}`}
          </button>
        )}
      </div>
    </div>
  );
}
