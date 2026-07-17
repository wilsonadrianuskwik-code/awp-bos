"use client";

import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils/cn";

export type BulkAction = {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

type BulkActionToolbarProps = {
  count: number;
  noun: string;
  actions: BulkAction[];
  onClear: () => void;
  className?: string;
};

// Floating action bar, shown only while a selection is active. Uses the
// same overlay elevation language as dialogs/popovers (shadow-modal) since
// it's a floating surface over content, not part of the page flow.
export function BulkActionToolbar({
  count,
  noun,
  actions,
  onClear,
  className,
}: BulkActionToolbarProps) {
  if (count === 0) return null;

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-card px-2 py-1.5 shadow-modal animate-page-enter",
        className
      )}
    >
      <div className="flex items-center gap-2 pl-2 pr-1">
        <span className="text-[13px] font-medium tabular-nums">
          {count} {noun}
          {count === 1 ? "" : "s"} selected
        </span>
      </div>
      <Separator orientation="vertical" className="h-5" />
      <div className="flex items-center gap-1">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant="ghost"
            size="sm"
            disabled={action.disabled}
            onClick={action.onClick}
            className={cn(
              "gap-1.5",
              action.destructive && "text-destructive hover:text-destructive"
            )}
          >
            <action.icon className="h-3.5 w-3.5" />
            {action.label}
          </Button>
        ))}
      </div>
      <Separator orientation="vertical" className="h-5" />
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        onClick={onClear}
        aria-label="Clear selection"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
