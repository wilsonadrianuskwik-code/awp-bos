"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

// The builders' autosave indicator, shared so both documents report save
// state identically. A pill with an icon reads at a glance from the
// corner of the eye — the bare text it replaces required actually
// reading it to know whether work was safe.
export function SaveStatusPill({
  status,
  isDirty,
}: {
  status: SaveStatus;
  isDirty: boolean;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-150 animate-in fade-in";

  if (status === "saving") {
    return (
      <span className={cn(base, "bg-muted text-muted-foreground")}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving…
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        className={cn(
          base,
          "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20 dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/20"
        )}
      >
        <AlertCircle className="h-3 w-3" />
        Save failed
      </span>
    );
  }
  if (isDirty) {
    return (
      <span
        className={cn(
          base,
          "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/25 dark:bg-amber-400/10 dark:text-amber-400 dark:ring-amber-400/20"
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
        Unsaved changes
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span
        className={cn(
          base,
          "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-400 dark:ring-emerald-400/20"
        )}
      >
        <Check className="h-3 w-3" />
        Saved
      </span>
    );
  }
  return null;
}
