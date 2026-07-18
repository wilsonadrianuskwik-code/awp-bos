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
} from "@dnd-kit/core";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type KanbanColumnDef<TItem> = {
  id: string;
  label: string;
  items: TItem[];
  footer?: ReactNode;
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
  children,
}: {
  column: { id: string; label: string; count: number; footer?: ReactNode };
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30 transition-colors duration-150",
        isOver && "border-primary/40 bg-primary/5"
      )}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>{column.label}</span>
        <span className="rounded bg-muted px-1.5 font-mono text-[10.5px] normal-case tracking-normal text-muted-foreground">
          {column.count}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
        {children}
      </div>
      {column.footer && (
        <div className="border-t px-3 py-2 text-xs font-medium tabular-nums text-muted-foreground">
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
      className={cn(isDragging && "touch-none opacity-0")}
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
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
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
    >
      <div className="flex gap-4 overflow-x-auto pb-2">
        {columns.map((column) => (
          <KanbanColumn
            key={column.id}
            column={{ id: column.id, label: column.label, count: column.items.length, footer: column.footer }}
          >
            {column.items.map((item) => (
              <DraggableCard key={getItemId(item)} id={getItemId(item)}>
                {renderCard(item)}
              </DraggableCard>
            ))}
          </KanbanColumn>
        ))}
      </div>
      <DragOverlay>
        {activeItem ? renderCard(activeItem) : null}
      </DragOverlay>
    </DndContext>
  );
}
