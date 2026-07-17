import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

type HeroMetric = {
  label: string;
  value: string | React.ReactNode;
};

type ProgressBar = {
  value: number;
  tone?: "default" | "danger" | "success";
};

type SummaryHeroProps = {
  primaryLabel: string;
  primaryValue: string;
  primaryTone?: "default" | "danger" | "success";
  secondaryMetrics?: HeroMetric[];
  actions?: React.ReactNode;
  progress?: ProgressBar;
};

const tonePrimaryClass: Record<string, string> = {
  danger: "text-red-600 dark:text-red-400",
  success: "text-emerald-600 dark:text-emerald-400",
};

const toneProgressClass: Record<string, string> = {
  default: "bg-amber-500",
  danger: "bg-red-500",
  success: "bg-emerald-500",
};

export function SummaryHero({
  primaryLabel,
  primaryValue,
  primaryTone = "default",
  secondaryMetrics,
  actions,
  progress,
}: SummaryHeroProps) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-1 flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {primaryLabel}
            </p>
            <p
              className={cn(
                "mt-1.5 text-4xl font-semibold tabular-nums tracking-tight",
                tonePrimaryClass[primaryTone]
              )}
            >
              {primaryValue}
            </p>
          </div>
          {secondaryMetrics && secondaryMetrics.length > 0 && (
            <div className="flex gap-x-10">
              {secondaryMetrics.map((m) => (
                <div key={m.label}>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {m.label}
                  </p>
                  <p className="mt-1.5 text-lg font-medium tabular-nums">
                    {m.value}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {progress && (
        <div className="h-1.5 w-full bg-muted">
          <div
            className={cn(
              "h-full transition-[width] duration-500",
              toneProgressClass[progress.tone ?? "default"]
            )}
            style={{ width: `${Math.min(100, Math.max(0, progress.value))}%` }}
          />
        </div>
      )}
    </Card>
  );
}
