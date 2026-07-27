"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
 * Every filter the register view supports, driven entirely by the URL.
 *
 * URL rather than component state so a filtered view is linkable,
 * survives a refresh, and can be deep-linked into from the project page.
 * Month/year are a convenience over the same date range the From/To
 * inputs write — setting one clears the other, since two ways to express
 * the same window that disagree would be worse than either alone.
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

  /** Month/year picks resolve to a concrete date range. */
  function applyPeriod(year: string, month: string) {
    if (!year || year === ALL) {
      apply({ year: null, month: null, from: null, to: null });
      return;
    }
    const y = Number(year);
    if (!month || month === ALL) {
      apply({
        year,
        month: null,
        from: `${y}-01-01`,
        to: `${y}-12-31`,
      });
      return;
    }
    const m = Number(month);
    const lastDay = new Date(y, m, 0).getDate();
    apply({
      year,
      month,
      from: `${y}-${String(m).padStart(2, "0")}-01`,
      to: `${y}-${String(m).padStart(2, "0")}-${lastDay}`,
    });
  }

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, i) => String(thisYear - i));

  const activeCount = [
    "project", "type", "q", "from", "to",
    "min", "max", "paidFrom", "paidTo", "status",
  ].filter((key) => searchParams.get(key)).length;

  return (
    <div className="space-y-3 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q: search.trim() || null });
          }}
        >
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => apply({ q: search.trim() || null })}
            placeholder="Search number or customer..."
            className="h-9 w-[240px]"
          />
        </form>

        <Select
          value={get("project") || ALL}
          onValueChange={(v) => apply({ project: v })}
        >
          <SelectTrigger className="h-9 w-[220px]">
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
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All document types</SelectItem>
            {DOCUMENT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {DOCUMENT_TYPE_LABEL[type as DocumentType]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={get("status") || ALL} onValueChange={(v) => apply({ status: v })}>
          <SelectTrigger className="h-9 w-[150px]">
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
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={get("year") || ALL}
          onValueChange={(v) => applyPeriod(v, get("month"))}
        >
          <SelectTrigger className="h-9 w-[110px]">
            <SelectValue placeholder="Year" />
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
          onValueChange={(v) => applyPeriod(get("year") || String(thisYear), v)}
        >
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder="Month" />
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

        <FilterField label="Created">
          <DateInput value={get("from")} onCommit={(v) => apply({ from: v, year: null, month: null })} />
          <span className="text-muted-foreground">–</span>
          <DateInput value={get("to")} onCommit={(v) => apply({ to: v, year: null, month: null })} />
        </FilterField>

        <FilterField label="Paid">
          <DateInput value={get("paidFrom")} onCommit={(v) => apply({ paidFrom: v })} />
          <span className="text-muted-foreground">–</span>
          <DateInput value={get("paidTo")} onCommit={(v) => apply({ paidTo: v })} />
        </FilterField>

        <FilterField label="Amount">
          <Input
            type="number"
            defaultValue={get("min")}
            onBlur={(e) => apply({ min: e.target.value || null })}
            placeholder="Min"
            className="h-9 w-[110px]"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number"
            defaultValue={get("max")}
            onBlur={(e) => apply({ max: e.target.value || null })}
            placeholder="Max"
            className="h-9 w-[110px]"
          />
        </FilterField>

        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              router.push(pathname);
            }}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Clear {activeCount} filter{activeCount === 1 ? "" : "s"}
          </Button>
        )}
      </div>
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
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
      className="h-9 w-[150px]"
    />
  );
}
