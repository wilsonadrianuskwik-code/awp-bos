"use client";

import { Table2, Columns3 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type ListView = "table" | "kanban";

type ViewToggleProps = {
  value: ListView;
  onChange: (view: ListView) => void;
};

// Small segmented control, same visual language as StatusTabs (pill,
// ring-1 ring-inset active state) so it reads as part of the same toolbar
// row rather than a new control pattern.
export function ViewToggle({ value, onChange }: ViewToggleProps) {
  const options: { value: ListView; label: string; icon: typeof Table2 }[] = [
    { value: "table", label: "Table", icon: Table2 },
    { value: "kanban", label: "Kanban", icon: Columns3 },
  ];

  return (
    <div className="inline-flex h-9 items-center gap-0.5 rounded-full border bg-muted/40 p-0.5">
      {options.map((opt) => (
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
