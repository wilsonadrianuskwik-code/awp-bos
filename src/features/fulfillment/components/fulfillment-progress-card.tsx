"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  ChevronRight,
  CalendarClock,
  UserCircle2,
  BadgeCheck,
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import {
  getFulfillmentEventsAction,
  updateFulfillmentStatusAction,
} from "@/features/fulfillment/actions";
import {
  daysSinceUpdated,
  trackerState,
  type TrackerVisualState,
} from "@/features/fulfillment/attention";
import type {
  FulfillmentEventWithRecorder,
  FulfillmentItemWithProgress,
} from "@/features/fulfillment/types";

// State → colour language, kept consistent with StatusBadge's families
// (blue = in progress, emerald = complete, amber = over, red = stalled).
const STATE: Record<
  TrackerVisualState,
  { stripe: string; tag: string; bar: string; label: string }
> = {
  over: {
    stripe: "border-l-amber-500",
    tag: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/25 dark:bg-amber-400/10 dark:text-amber-400 dark:ring-amber-400/20",
    bar: "bg-amber-500",
    label: "Over-delivered",
  },
  completed: {
    stripe: "border-l-emerald-500",
    tag: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-400 dark:ring-emerald-400/20",
    bar: "bg-emerald-500",
    label: "Completed",
  },
  stalled: {
    stripe: "border-l-red-500",
    tag: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20 dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/20",
    bar: "bg-primary",
    label: "Stalled",
  },
  in_progress: {
    stripe: "border-l-blue-500",
    tag: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20 dark:bg-blue-400/10 dark:text-blue-400 dark:ring-blue-400/20",
    bar: "bg-primary",
    label: "In progress",
  },
  pending: {
    stripe: "border-l-slate-300 dark:border-l-slate-600",
    tag: "bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-500/20 dark:bg-slate-400/10 dark:text-slate-400 dark:ring-slate-400/20",
    bar: "bg-primary",
    label: "Pending",
  },
};

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type FulfillmentProgressCardProps = {
  tracker: FulfillmentItemWithProgress;
  stalledAfterDays: number;
  onRecordDelivery: (tracker: FulfillmentItemWithProgress) => void;
};

export function FulfillmentProgressCard({
  tracker,
  stalledAfterDays,
  onRecordDelivery,
}: FulfillmentProgressCardProps) {
  const router = useRouter();
  const { workspace, can } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [historyOpen, setHistoryOpen] = useState(false);
  const [events, setEvents] = useState<FulfillmentEventWithRecorder[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const state = trackerState(tracker, stalledAfterDays);
  const style = STATE[state];
  const unit = tracker.unit ? ` ${tracker.unit}` : "";
  const fillPct = Math.min(
    100,
    tracker.purchased > 0
      ? Math.round((tracker.delivered / tracker.purchased) * 100)
      : 0
  );
  const canDeliver = tracker.status === "pending" || tracker.status === "in_progress";
  const isTerminal = tracker.status === "completed" || tracker.status === "cancelled";
  const idleDays = daysSinceUpdated(tracker);

  async function toggleHistory() {
    if (!historyOpen && events === null) {
      setLoadingHistory(true);
      const res = await getFulfillmentEventsAction(workspace.id, tracker.id);
      setEvents(res.data ?? []);
      setLoadingHistory(false);
    }
    setHistoryOpen((v) => !v);
  }

  function reopen() {
    startTransition(async () => {
      const res = await updateFulfillmentStatusAction(workspace.id, tracker.id, {
        status: "in_progress",
      });
      if (res.error) {
        toast(res.error, "error");
        return;
      }
      toast("Fulfillment reopened", "success");
      router.refresh();
    });
  }

  return (
    <div className={cn("rounded-lg border border-l-[3px] bg-card", style.stripe)}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold leading-tight tracking-tight">
              {tracker.description}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <Link
                href={`/${workspace.slug}/invoices/${tracker.invoice_id}`}
                className="font-mono hover:text-primary hover:underline"
              >
                {tracker.invoice_number}
              </Link>
              {state === "stalled" && (
                <span className="text-red-600 dark:text-red-400">
                  · no delivery in {idleDays}d
                </span>
              )}
              {tracker.project_id && (
                <Link
                  href={`/${workspace.slug}/fulfillment/${tracker.invoice_id}`}
                  className="hover:text-primary hover:underline"
                >
                  · Project: {tracker.project_name || "Untitled"}
                </Link>
              )}
            </div>
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide",
              style.tag
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {state === "stalled" ? `Stalled · ${idleDays}d` : style.label}
          </span>
        </div>

        {/* Large progress visualization — the card's focal point */}
        <div className="mt-3.5 flex items-center gap-4">
          <div className="flex shrink-0 items-baseline gap-1">
            <span className="font-mono text-[28px] font-bold leading-none tracking-tight tabular-nums">
              {tracker.delivered}
            </span>
            <span className="font-mono text-sm text-muted-foreground">/</span>
            <span className="font-mono text-base font-semibold text-muted-foreground tabular-nums">
              {tracker.purchased}
            </span>
            {tracker.unit && (
              <span className="self-end pb-0.5 text-xs text-muted-foreground">
                {tracker.unit}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "animate-grow-x h-full rounded-full transition-[width] duration-500",
                  style.bar
                )}
                style={{ width: `${fillPct}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-xs">
              <span className="text-muted-foreground">
                {tracker.is_over_delivered ? (
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    Over by {tracker.delivered - tracker.purchased}
                    {unit}
                  </span>
                ) : (
                  <>
                    <b className="font-mono text-foreground">{tracker.remaining}</b>
                    {unit} remaining
                  </>
                )}
              </span>
              <span className="font-mono text-muted-foreground tabular-nums">
                {tracker.progress_percent}%
              </span>
            </div>
          </div>
        </div>

        {/* Future-proof operational slots: Staff Assignment + Scheduling
            (+ Sign-off on completed). Non-functional placeholders today —
            obvious homes so these extensions drop in without a redesign. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground/80">
          <span className="inline-flex items-center gap-1.5">
            <UserCircle2 className="h-3.5 w-3.5" />
            Unassigned
          </span>
          {!isTerminal && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              No delivery date
            </span>
          )}
          {tracker.status === "completed" && (
            <span className="inline-flex items-center gap-1.5">
              <BadgeCheck className="h-3.5 w-3.5" />
              Sign-off not requested
            </span>
          )}
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t pt-3">
          {canDeliver && (
            <Button size="sm" onClick={() => onRecordDelivery(tracker)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Record Delivery
            </Button>
          )}
          {isTerminal && can("admin") && (
            <Button size="sm" variant="outline" onClick={reopen} disabled={isPending}>
              Reopen
            </Button>
          )}
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/${workspace.slug}/fulfillment/tracker/${tracker.id}`}>
              Open record
              <ChevronRight className="ml-0.5 h-4 w-4" />
            </Link>
          </Button>

          <button
            type="button"
            onClick={toggleHistory}
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary"
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                historyOpen && "rotate-90"
              )}
            />
            Delivery history
          </button>
        </div>

        {historyOpen && (
          <div className="mt-3 border-t border-dashed pt-3">
            {loadingHistory ? (
              <p className="py-3 text-center text-xs text-muted-foreground">
                Loading…
              </p>
            ) : !events || events.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">
                No deliveries recorded yet.
              </p>
            ) : (
              <div className="flex flex-col">
                {events.map((e, i) => (
                  <div key={e.id} className="flex gap-3">
                    <div className="flex w-3 flex-col items-center">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      {i < events.length - 1 && (
                        <span className="w-0.5 flex-1 bg-border" />
                      )}
                    </div>
                    <div className="flex flex-1 items-baseline justify-between pb-3">
                      <span className="font-mono text-[13px] font-semibold">
                        +{e.quantity_delivered}
                        {unit}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(e.event_date)} ·{" "}
                        <span className="text-muted-foreground/70">
                          {e.recorded_by_profile?.full_name ?? "Unknown"}
                        </span>
                        {/* Attachments (proof of delivery) will attach per
                            event here — reserved slot for that extension. */}
                        <Paperclip className="ml-1.5 inline h-3 w-3 opacity-0" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
