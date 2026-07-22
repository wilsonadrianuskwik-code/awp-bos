"use client";

import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils/cn";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { rescheduleFulfillmentDeliverableAction } from "@/features/fulfillment/actions-projects";
import {
  addDays,
  formatISODate,
  getMonthGridDays,
  groupByDateKey,
  isSameDay,
  startOfWeek,
} from "@/features/fulfillment/date-utils";
import type {
  DeliverableStatus,
  FulfillmentDeliverable,
} from "@/features/fulfillment/types-projects";

type DeliverableCalendarProps = {
  deliverables: FulfillmentDeliverable[];
  onSelectDeliverable: (id: string) => void;
  onChanged: () => void;
};

// Mirrors the tone language established by the Kanban lanes/cards (amber =
// scheduled, emerald = posted, red = cancelled) so status colors agree
// across every view in the workspace.
const CHIP_TONE: Record<DeliverableStatus, string> = {
  scheduled:
    "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-400",
  in_progress:
    "bg-blue-50 text-blue-800 dark:bg-blue-400/10 dark:text-blue-400",
  posted:
    "bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-400",
  cancelled:
    "bg-red-50 text-red-800 line-through dark:bg-red-400/10 dark:text-red-400",
};

const MAX_CHIPS_PER_DAY = 3;

function DayChip({
  deliverable,
  onSelectDeliverable,
}: {
  deliverable: FulfillmentDeliverable;
  onSelectDeliverable: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deliverable.id,
  });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      onClick={() => onSelectDeliverable(deliverable.id)}
      title={deliverable.title}
      className={cn(
        "block w-full cursor-grab truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium active:cursor-grabbing",
        CHIP_TONE[deliverable.status],
        isDragging && "opacity-0"
      )}
    >
      {deliverable.title}
    </button>
  );
}

function DayCell({
  day,
  inCurrentMonth,
  isToday,
  items,
  onSelectDeliverable,
}: {
  day: Date;
  inCurrentMonth: boolean;
  isToday: boolean;
  items: FulfillmentDeliverable[];
  onSelectDeliverable: (id: string) => void;
}) {
  const dateKey = formatISODate(day);
  const { setNodeRef, isOver } = useDroppable({ id: dateKey });
  const visible = items.slice(0, MAX_CHIPS_PER_DAY);
  const overflow = items.length - visible.length;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[96px] flex-col gap-1 border-b border-r p-1.5 transition-colors last:border-r-0",
        !inCurrentMonth && "bg-muted/20",
        isOver && "bg-primary/5 ring-1 ring-inset ring-primary/30"
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full text-[11px] tabular-nums",
          isToday && "bg-primary font-semibold text-primary-foreground",
          !inCurrentMonth && !isToday && "text-muted-foreground/50"
        )}
      >
        {day.getDate()}
      </span>
      <div className="flex flex-1 flex-col gap-0.5">
        {visible.map((d) => (
          <DayChip key={d.id} deliverable={d} onSelectDeliverable={onSelectDeliverable} />
        ))}
        {overflow > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="text-left text-[10.5px] text-muted-foreground hover:text-primary"
              >
                +{overflow} more
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 space-y-1 p-2">
              {items.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onSelectDeliverable(d.id)}
                  className={cn(
                    "block w-full truncate rounded px-1.5 py-1 text-left text-[12px]",
                    CHIP_TONE[d.status]
                  )}
                >
                  {d.title}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Calendar v1: month grid (default) or a single week row, deliverables
// grouped onto their scheduled_date, drag a chip to a new day cell to
// reschedule it (same rescheduleFulfillmentDeliverableAction every other
// view already uses). Clicking a chip opens the same DeliverableDetailSheet
// every other view opens, via the shared onSelectDeliverable callback — no
// new edit UI for this view.
export function DeliverableCalendar({
  deliverables,
  onSelectDeliverable,
  onChanged,
}: DeliverableCalendarProps) {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [mode, setMode] = useState<"month" | "week">("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const byDate = useMemo(
    () => groupByDateKey(deliverables, (d) => d.scheduled_date),
    [deliverables]
  );

  const days = useMemo(() => {
    if (mode === "month") {
      return getMonthGridDays(anchor.getFullYear(), anchor.getMonth());
    }
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [mode, anchor]);

  const currentMonth = anchor.getMonth();
  const today = new Date();
  const activeItem = activeId ? deliverables.find((d) => d.id === activeId) : null;

  function goPrev() {
    setAnchor((prev) =>
      mode === "month"
        ? new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
        : addDays(prev, -7)
    );
  }
  function goNext() {
    setAnchor((prev) =>
      mode === "month"
        ? new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
        : addDays(prev, 7)
    );
  }
  function goToday() {
    setAnchor(new Date());
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const deliverableId = String(active.id);
    const newDate = String(over.id);
    const item = deliverables.find((d) => d.id === deliverableId);
    if (!item || item.scheduled_date === newDate) return;

    startTransition(async () => {
      const result = await rescheduleFulfillmentDeliverableAction(workspace.id, deliverableId, {
        scheduled_date: newDate,
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Rescheduled", "success");
      onChanged();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goPrev} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goNext} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <span className="ml-2 text-sm font-medium">
            {anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-md border p-0.5">
          <button
            type="button"
            onClick={() => setMode("month")}
            className={cn(
              "rounded px-2 py-1 text-xs font-medium transition-colors",
              mode === "month" ? "bg-muted text-foreground" : "text-muted-foreground"
            )}
          >
            Month
          </button>
          <button
            type="button"
            onClick={() => setMode("week")}
            className={cn(
              "rounded px-2 py-1 text-xs font-medium transition-colors",
              mode === "week" ? "bg-muted text-foreground" : "text-muted-foreground"
            )}
          >
            Week
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="overflow-hidden rounded-lg border">
          <div className="grid grid-cols-7 border-b bg-card">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="border-r px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground last:border-r-0"
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => (
              <DayCell
                key={day.toISOString()}
                day={day}
                inCurrentMonth={mode === "week" || day.getMonth() === currentMonth}
                isToday={isSameDay(day, today)}
                items={byDate.get(formatISODate(day)) ?? []}
                onSelectDeliverable={onSelectDeliverable}
              />
            ))}
          </div>
        </div>
        <DragOverlay>
          {activeItem ? (
            <div
              className={cn(
                "w-40 truncate rounded px-1.5 py-0.5 text-[11px] font-medium shadow-lg",
                CHIP_TONE[activeItem.status]
              )}
            >
              {activeItem.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
