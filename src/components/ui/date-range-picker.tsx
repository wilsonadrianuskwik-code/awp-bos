"use client";

import { useState } from "react";
import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type DateRange = {
  from: string;
  to: string;
};

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type DateRangePickerProps = {
  value: DateRange;
  onChange: (value: DateRange) => void;
};

/**
 * Generic date-range primitive — not report-specific, so any future
 * feature can reuse it. Composed from existing primitives (Popover,
 * Input, Button) rather than a new third-party calendar dependency; a
 * charting library is the one new dependency this phase introduces
 * (Milestone 3), not this control.
 */
export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  function handleOpenChange(next: boolean) {
    if (next) setDraft(value);
    setOpen(next);
  }

  function apply() {
    onChange(draft);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-start font-normal">
          <Calendar className="mr-2 h-4 w-4" />
          {formatDate(value.from)} – {formatDate(value.to)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>From</Label>
            <Input
              type="date"
              value={draft.from}
              max={draft.to}
              onChange={(e) => setDraft((prev) => ({ ...prev, from: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <Input
              type="date"
              value={draft.to}
              min={draft.from}
              onChange={(e) => setDraft((prev) => ({ ...prev, to: e.target.value }))}
            />
          </div>
        </div>
        <Button className="mt-3 w-full" size="sm" onClick={apply}>
          Apply
        </Button>
      </PopoverContent>
    </Popover>
  );
}
