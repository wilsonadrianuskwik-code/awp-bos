import { formatCurrency } from "@/lib/utils/format-currency";
import type { ProjectHealth } from "@/features/projects/types";

type ProjectHealthStripProps = {
  health: ProjectHealth;
  currency: string;
};

// A simple 4-segment strip — Quoted / Invoiced / Paid / Delivered — no
// chart library, just labeled numbers with a lightweight proportional bar
// underneath each so relative scale is still legible at a glance.
export function ProjectHealthStrip({ health, currency }: ProjectHealthStripProps) {
  const segments = [
    { label: "Quoted", value: health.quoted_total, tone: "bg-blue-500" },
    { label: "Invoiced", value: health.invoiced_total, tone: "bg-amber-500" },
    { label: "Paid", value: health.paid_total, tone: "bg-emerald-500" },
    {
      label: "Delivered",
      value: health.delivered_count,
      display: `${health.delivered_count} / ${health.delivery_total}`,
      tone: "bg-violet-500",
    },
  ];

  const max = Math.max(1, ...segments.map((s) => s.value));

  return (
    <div className="grid gap-4 sm:grid-cols-4">
      {segments.map((s) => (
        <div key={s.label} className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {s.label}
          </p>
          <p className="text-lg font-semibold tabular-nums">
            {s.display ?? formatCurrency(s.value, currency)}
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${s.tone}`}
              style={{ width: `${Math.min(100, (s.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
