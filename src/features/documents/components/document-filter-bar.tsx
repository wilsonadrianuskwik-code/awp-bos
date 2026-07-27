"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ListFilter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABEL,
  type DocumentType,
} from "@/features/documents/document-types";

/** Radix Select can't hold an empty-string value. */
export const ALL = "__all__";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The register's filters.
 *
 * Three are on the surface — search, project, type — because they're the
 * ones reached for constantly. The other nine live behind a Filters
 * popover: a dozen controls in a row reads as a form to fill in rather
 * than a set of choices, and the earlier flat layout genuinely was hard
 * to look at.
 *
 * Whatever is active comes back out as removable chips, so a collapsed
 * panel never hides state. Everything is URL-driven, which keeps any
 * view linkable and lets the project page deep-link into it.
 */
export function DocumentFilterBar({
  projects,
  statuses,
}: {
  projects: { id: string; code: string; name: string }[];
  statuses: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [open, setOpen] = useState(false);

  const get = (key: string) => searchParams.get(key) ?? "";

  function apply(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === ALL) params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  /** Month/year picks resolve to the same date range the inputs write. */
  function applyPeriod(year: string, month: string) {
    if (!year || year === ALL) {
      apply({ year: null, month: null, from: null, to: null });
      return;
    }
    const y = Number(year);
    if (!month || month === ALL) {
      apply({ year, month: null, from: `${y}-01-01`, to: `${y}-12-31` });
      return;
    }
    const m = String(Number(month)).padStart(2, "0");
    const lastDay = new Date(y, Number(month), 0).getDate();
    apply({ year, month, from: `${y}-${m}-01`, to: `${y}-${m}-${lastDay}` });
  }

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, i) => String(thisYear - i));

  // Chips describe filters in the words the user chose them by, not the
  // query-string keys behind them.
  const chips: { key: string; label: string; clear: Record<string, null> }[] = [];
  if (get("q")) chips.push({ key: "q", label: `"${get("q")}"`, clear: { q: null } });
  if (get("project")) {
    const project = projects.find((p) => p.id === get("project"));
    chips.push({
      key: "project",
      label: project ? project.code : "Project",
      clear: { project: null },
    });
  }
  if (get("type")) {
    chips.push({
      key: "type",
      label: DOCUMENT_TYPE_LABEL[get("type") as DocumentType] ?? "Type",
      clear: { type: null },
    });
  }
  if (get("status")) {
    chips.push({
      key: "status",
      label: get("status").replace(/_/g, " "),
      clear: { status: null },
    });
  }
  if (get("year")) {
    const month = get("month");
    chips.push({
      key: "period",
      label: month ? `${MONTHS[Number(month) - 1]} ${get("year")}` : get("year"),
      clear: { year: null, month: null, from: null, to: null },
    });
  } else if (get("from") || get("to")) {
    chips.push({
      key: "created",
      label: `Created ${get("from") || "…"} → ${get("to") || "…"}`,
      clear: { from: null, to: null },
    });
  }
  if (get("paidFrom") || get("paidTo")) {
    chips.push({
      key: "paid",
      label: `Paid ${get("paidFrom") || "…"} → ${get("paidTo") || "…"}`,
      clear: { paidFrom: null, paidTo: null },
    });
  }
  if (get("min") || get("max")) {
    chips.push({
      key: "amount",
      label: `Amount ${get("min") || "0"} – ${get("max") || "∞"}`,
      clear: { min: null, max: null },
    });
  }

  // Counts only what the popover holds, so the badge answers "how much
  // is hidden in there" rather than restating the visible chips.
  const advancedCount = ["status", "year", "from", "to", "paidFrom", "paidTo", "min", "max"]
    .filter((key) => searchParams.get(key)).length;

  function clearAll() {
    setSearch("");
    router.push(pathname);
  }

  return (
    <div className="space-y-2.5 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q: search.trim() || null });
          }}
        >
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => apply({ q: search.trim() || null })}
            placeholder="Search number or customer"
            className="h-9 w-[260px] pl-8"
          />
        </form>

        <Select
          value={get("project") || ALL}
          onValueChange={(v) => apply({ project: v })}
        >
          <SelectTrigger className="h-9 w-[200px]">
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.code} — {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={get("type") || ALL} onValueChange={(v) => apply({ type: v })}>
          <SelectTrigger className="h-9 w-[175px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All document types</SelectItem>
            {DOCUMENT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {DOCUMENT_TYPE_LABEL[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              <ListFilter className="mr-1.5 h-3.5 w-3.5" />
              Filters
              {advancedCount > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[11px] font-medium leading-[18px] text-primary-foreground">
                  {advancedCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[380px] space-y-4 p-4">
            <Field label="Status">
              <Select
                value={get("status") || ALL}
                onValueChange={(v) => apply({ status: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Any status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Any status</SelectItem>
                  {statuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Period">
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={get("year") || ALL}
                  onValueChange={(v) => applyPeriod(v, get("month"))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Any year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Any year</SelectItem>
                    {years.map((y) => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={get("month") || ALL}
                  onValueChange={(v) =>
                    applyPeriod(get("year") || String(thisYear), v)
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Any month" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Any month</SelectItem>
                    {MONTHS.map((label, i) => (
                      <SelectItem key={label} value={String(i + 1)}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Field>

            <Field label="Created between">
              <RangeRow>
                <DateInput
                  value={get("from")}
                  onCommit={(v) => apply({ from: v, year: null, month: null })}
                />
                <DateInput
                  value={get("to")}
                  onCommit={(v) => apply({ to: v, year: null, month: null })}
                />
              </RangeRow>
            </Field>

            <Field label="Payment received between">
              <RangeRow>
                <DateInput
                  value={get("paidFrom")}
                  onCommit={(v) => apply({ paidFrom: v })}
                />
                <DateInput
                  value={get("paidTo")}
                  onCommit={(v) => apply({ paidTo: v })}
                />
              </RangeRow>
            </Field>

            <Field label="Amount">
              <RangeRow>
                <Input
                  type="number"
                  defaultValue={get("min")}
                  onBlur={(e) => apply({ min: e.target.value || null })}
                  placeholder="Min"
                  className="h-9"
                />
                <Input
                  type="number"
                  defaultValue={get("max")}
                  onBlur={(e) => apply({ max: e.target.value || null })}
                  placeholder="Max"
                  className="h-9"
                />
              </RangeRow>
            </Field>
          </PopoverContent>
        </Popover>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => {
                if (chip.key === "q") setSearch("");
                apply(chip.clear);
              }}
              className="group inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pl-2.5 pr-1.5 text-xs text-muted-foreground transition-colors duration-100 hover:border-primary/30 hover:text-foreground"
            >
              <span className="max-w-[220px] truncate">{chip.label}</span>
              <X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
            </button>
          ))}
          {chips.length > 1 && (
            <button
              type="button"
              onClick={clearAll}
              className="ml-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** Two controls with an en-dash between them, sized evenly. */
function RangeRow({ children }: { children: React.ReactNode }) {
  const [start, end] = Array.isArray(children) ? children : [children, null];
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">{start}</div>
      <span className="text-xs text-muted-foreground">–</span>
      <div className="flex-1">{end}</div>
    </div>
  );
}

/**
 * Commits on change rather than on blur: a date picker's value is only
 * ever a complete date, so waiting for blur just delays the result.
 */
function DateInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string | null) => void;
}) {
  return (
    <Input
      type="date"
      value={value}
      onChange={(e) => onCommit(e.target.value || null)}
      className="h-9 w-full"
    />
  );
}
