"use client";

import { X } from "lucide-react";

/**
 * The label above an opt-in builder section (Note to client, Terms &
 * Conditions), with the control that closes it again.
 *
 * Opening one of these was a one-way door: the "+ Note to client" chip
 * added the section, and nothing took it away. Someone who typed a note
 * and then thought better of it had to select the text and delete it by
 * hand, and even then the empty editor stayed on screen.
 *
 * onRemove is expected to clear the field as well as hide it — a hidden
 * section whose value still saves would put text on the printed document
 * that the builder no longer shows.
 */
export function BuilderSectionHeader({
  label,
  onRemove,
  removeLabel,
}: {
  label: string;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        title={removeLabel}
        className="-mr-1 rounded p-1 text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
