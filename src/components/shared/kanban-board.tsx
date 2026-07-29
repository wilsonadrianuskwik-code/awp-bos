"use client";

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { STATUS_TONE, type Tone } from "@/components/shared/status-badge";

// Centers the drag overlay on the pointer instead of preserving the exact
// pixel it was grabbed at — see the comment on <DragOverlay> below for why.
// Inlined (rather than depending on @dnd-kit/modifiers, a package this repo
// doesn't otherwise install) since it's one small, stable function; @dnd-kit/
// utilities is already a dependency and exports the coordinate helper it needs.
const snapCenterToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!draggingNodeRect || !activatorEvent) return transform;
  const activatorCoordinates = getEventCoordinates(activatorEvent);
  if (!activatorCoordinates) return transform;
  const offsetX = activatorCoordinates.x - draggingNodeRect.left;
  const offsetY = activatorCoordinates.y - draggingNodeRect.top;
  return {
    ...transform,
    x: transform.x + offsetX - draggingNodeRect.width / 2,
    y: transform.y + offsetY - draggingNodeRect.height / 2,
  };
};

export type KanbanTone =
  | "amber"
  | "emerald"
  | "red"
  | "blue"
  | "slate"
  | "violet";

/**
 * A lane's colour is derived from the status it holds, never chosen by
 * hand — that's the only way a column and the cards inside it can't
 * disagree. Hand-picking lane tones is exactly how "Sent" ended up an
 * amber column full of blue cards.
 */
const TONE_FROM_STATUS_TONE: Record<Tone, KanbanTone> = {
  neutral: "slate",
  info: "blue",
  attention: "amber",
  success: "emerald",
  danger: "red",
  special: "violet",
};

export function kanbanToneForStatus(status: string): KanbanTone {
  return TONE_FROM_STATUS_TONE[STATUS_TONE[status] ?? "neutral"];
}

/**
 * Per-column colour. A board's columns *are* its lifecycle, so colouring
 * them is the one place colour carries real meaning: you learn the
 * pipeline's shape by where the green is, without reading a word.
 *
 * Each tone paints three things — a solid rail across the column's top,
 * a tinted header, and a tinted column body — so a stage is legible from
 * the far side of the screen but a white card still sits clearly on it.
 */
const TONE_RAIL: Record<KanbanTone, string> = {
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  red: "bg-red-500",
  blue: "bg-blue-500",
  slate: "bg-slate-400 dark:bg-slate-500",
  violet: "bg-violet-500",
};

const TONE_HEADER: Record<KanbanTone, string> = {
  amber: "bg-amber-500/[0.12] text-amber-800 dark:text-amber-300",
  emerald: "bg-emerald-500/[0.12] text-emerald-800 dark:text-emerald-300",
  red: "bg-red-500/[0.12] text-red-800 dark:text-red-300",
  blue: "bg-blue-500/[0.12] text-blue-800 dark:text-blue-300",
  slate: "bg-slate-500/[0.12] text-slate-700 dark:text-slate-300",
  violet: "bg-violet-500/[0.12] text-violet-800 dark:text-violet-300",
};

const TONE_BODY: Record<KanbanTone, string> = {
  amber: "bg-amber-500/[0.05]",
  emerald: "bg-emerald-500/[0.05]",
  red: "bg-red-500/[0.05]",
  blue: "bg-blue-500/[0.05]",
  slate: "bg-slate-500/[0.05]",
  violet: "bg-violet-500/[0.05]",
};

const TONE_COUNT: Record<KanbanTone, string> = {
  amber: "bg-amber-500/20 text-amber-800 dark:text-amber-200",
  emerald: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-200",
  red: "bg-red-500/20 text-red-800 dark:text-red-200",
  blue: "bg-blue-500/20 text-blue-800 dark:text-blue-200",
  slate: "bg-slate-500/20 text-slate-700 dark:text-slate-200",
  violet: "bg-violet-500/20 text-violet-800 dark:text-violet-200",
};

export type KanbanColumnDef<TItem> = {
  id: string;
  label: string;
  items: TItem[];
  footer?: ReactNode;
  tone?: KanbanTone;
  // Shown instead of a bare empty gap when this column has zero items —
  // optional, defaults to a generic "Nothing here" inside KanbanColumn.
  emptyLabel?: string;
};

type KanbanBoardProps<TItem> = {
  columns: KanbanColumnDef<TItem>[];
  getItemId: (item: TItem) => string;
  renderCard: (item: TItem) => ReactNode;
  // Called on a completed drop into a different column. The board itself
  // holds no state — `columns` is always the source of truth, so if the
  // caller decides not to update it (an invalid transition), the item
  // simply re-renders back in its original column on the next pass.
  onDrop: (itemId: string, fromColumnId: string, toColumnId: string) => void;
};

function KanbanColumn({
  column,
  emptyLabel,
  children,
}: {
  column: { id: string; label: string; count: number; footer?: ReactNode; tone?: KanbanTone };
  emptyLabel?: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        // min-h-0 overrides the flex item default of min-height:auto, which
        // would otherwise let this column's content stretch the whole row
        // taller instead of scrolling inside overflow-y-auto below.
        "flex h-full min-h-0 w-[252px] shrink-0 flex-col overflow-hidden rounded-xl border shadow-[0_0_0_0_transparent] transition-[border-color,background-color,box-shadow] duration-200",
        column.tone ? TONE_BODY[column.tone] : "bg-muted/40",
        isOver && "border-primary/50 bg-primary/5 shadow-[inset_0_0_0_1px] shadow-primary/25"
      )}
    >
      {/* The rail is what makes a stage identifiable at a glance — the
          tint alone is too quiet once cards cover most of the column. */}
      {column.tone && (
        <div
          className={cn(
            "h-1 w-full shrink-0 [print-color-adjust:exact]",
            TONE_RAIL[column.tone]
          )}
        />
      )}
      {/* Sticky within the column's own scroll container — the header stays
          pinned while a long column's cards scroll underneath it, matching
          the sticky treatment applied to List's table header. */}
      <div
        className={cn(
          "sticky top-0 z-10 flex items-center gap-2 border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wider",
          column.tone
            ? TONE_HEADER[column.tone]
            : "bg-card text-foreground/80"
        )}
      >
        <span className="truncate">{column.label}</span>
        <span
          className={cn(
            "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal tabular-nums",
            column.tone ? TONE_COUNT[column.tone] : "bg-muted text-muted-foreground"
          )}
        >
          {column.count}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
        {column.count === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-6 text-center text-[11px] text-muted-foreground/60">
            {emptyLabel ?? "Nothing here"}
          </div>
        ) : (
          children
        )}
      </div>
      {column.footer && (
        <div className="border-t px-3 py-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          {column.footer}
        </div>
      )}
    </div>
  );
}

function DraggableCard({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab active:cursor-grabbing",
        isDragging && "touch-none cursor-grabbing opacity-0"
      )}
    >
      {children}
    </div>
  );
}

// Generic drag-and-drop board: columns are lanes, cards move between them
// on drop. A PointerSensor activation distance means a plain click still
// opens the record (via the card's own onClick) instead of always starting
// a drag. The dragged card is hidden in place and rendered via DragOverlay
// so it floats above column scroll containers instead of being clipped.
//
// Mouse and touch use separate sensors (not one PointerSensor, which
// would otherwise double-handle touch input) so each can have the
// activation behavior that actually fits the input: mouse just needs a
// small drag distance before a click becomes a drag, while touch needs a
// delay-based TouchSensor instead of touch-action: none on every card —
// that CSS property would otherwise block the lane's native vertical
// scroll on any touch that starts on a card (most of a lane's surface),
// turning "flick to scroll" into "card doesn't move". TouchSensor's
// delay+tolerance instead lets a quick touch-and-move register as a
// normal scroll; only a touch held still past the delay activates a drag.
export function KanbanBoard<TItem>({
  columns,
  getItemId,
  renderCard,
  onDrop,
}: KanbanBoardProps<TItem>) {
  // A short activation distance means the drag starts the instant the
  // pointer moves, rather than requiring a deliberate drag gesture first —
  // this is what makes Jira/Linear-style boards feel like the card is
  // "attached" to the cursor immediately instead of lagging behind it.
  // Still enough (4px) that a plain click reliably opens the card instead
  // of accidentally starting a drag.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  function findColumnIdForItem(id: string): string | null {
    for (const column of columns) {
      if (column.items.some((item) => getItemId(item) === id)) return column.id;
    }
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const itemId = String(active.id);
    const toColumnId = String(over.id);
    const fromColumnId = findColumnIdForItem(itemId);
    if (!fromColumnId || fromColumnId === toColumnId) return;
    onDrop(itemId, fromColumnId, toColumnId);
  }

  const activeItem = activeId
    ? columns.flatMap((c) => c.items).find((item) => getItemId(item) === activeId)
    : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {/* Bounded height so each column scrolls its own cards internally
          (KanbanColumn's own overflow-y-auto) instead of the whole page
          growing to fit the tallest column — without a height on this
          row, flex children have no basis to compute against and just
          expand to their content's full height. */}
      <div className="flex h-[calc(100vh-320px)] min-h-[420px] gap-4 overflow-x-auto pb-2">
        {columns.map((column) => (
          <KanbanColumn
            key={column.id}
            column={{
              id: column.id,
              label: column.label,
              count: column.items.length,
              footer: column.footer,
              tone: column.tone,
            }}
            emptyLabel={column.emptyLabel}
          >
            {column.items.map((item) => (
              <DraggableCard key={getItemId(item)} id={getItemId(item)}>
                {renderCard(item)}
              </DraggableCard>
            ))}
          </KanbanColumn>
        ))}
      </div>
      {/* DragOverlay portals outside the column's flex/stretch context, so
          without an explicit width the cloned card shrinks/grows to fit its
          own content instead of staying the column's width. w-[272px] = the
          column's w-72 (288px) minus its content wrapper's p-2 padding (8px
          each side) — the exact stretched width a card has in-column.

          snapCenterToCursor overrides dnd-kit's default "preserve the exact
          pixel you grabbed" placement — that default drifts visibly whenever
          the overlay's measured rect doesn't perfectly match the source
          card's live rect (nested independently-scrolling containers here:
          the board scrolls horizontally, each column scrolls vertically on
          its own, so the two rects can disagree by a few pixels). Centering
          the ghost on the pointer instead guarantees it's always exactly
          under the cursor, at the cost of the grab-point offset — the
          standard trade-off for multi-scroll-container Kanban boards.
          scale-105 + shadow-xl read as "lifted" without the drift a rotate
          transform would add (rotation pivots around the card's center).
          dropAnimation={null} skips dnd-kit's default "snap back" animation
          on drop, which otherwise adds a beat of lag before the real
          (optimistic) card appears in its new column. */}
      <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
        {activeItem ? (
          <div className="w-[272px] scale-105 cursor-grabbing shadow-xl transition-shadow">
            {renderCard(activeItem)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
