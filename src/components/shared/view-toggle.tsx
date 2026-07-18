"use client";

import { Table2, Columns3, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type ListView = "table" | "kanban";

const DEFAULT_OPTIONS: { value: ListView; label: string; icon: LucideIcon }[] = [
  { value: "table", label: "Table", icon: Table2 },
  { value: "kanban", label: "Kanban", icon: Columns3 },
];

type ViewToggleProps<T extends string> = {
  value: T;
  onChange: (view: T) => void;
  /** Defaults to the Table/Kanban pair used by Invoice/Quotation boards.
   *  Pass a custom set (e.g. Table/Grid) for modules without a pipeline
   *  view — the pill/ring visual language stays identical either way. */
  options?: { value: T; label: string; icon: LucideIcon }[];
};

// Small segmented control, same visual language as StatusTabs (pill,
// ring-1 ring-inset active state) so it reads as part of the same toolbar
// row rather than a new control pattern.
export function ViewToggle<T extends string = ListView>({
  value,
  onChange,
  options,
}: ViewToggleProps<T>) {
  const resolved = options ?? (DEFAULT_OPTIONS as unknown as ViewToggleProps<T>["options"]);

  return (
    <div className="inline-flex h-9 items-center gap-0.5 rounded-full border bg-muted/40 p-0.5">
      {resolved!.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "inline-flex h-full items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors",
            value === opt.value
              ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <opt.icon className="h-3.5 w-3.5" />
          {opt.label}
        </button>
      ))}
    </div>
  );
}
