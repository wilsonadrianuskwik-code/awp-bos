"use client";

import { cn } from "@/lib/utils/cn";

export type StatusTab = {
  value: string;
  label: string;
  count?: number;
};

type StatusTabsProps = {
  tabs: readonly StatusTab[] | StatusTab[];
  value: string;
  onValueChange: (value: string) => void;
};

export function StatusTabs({ tabs, value, onValueChange }: StatusTabsProps) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onValueChange(tab.value)}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-100",
            value === tab.value
              ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {tab.label}
          {tab.count != null && (
            <span className="ml-1.5 tabular-nums text-muted-foreground">
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
