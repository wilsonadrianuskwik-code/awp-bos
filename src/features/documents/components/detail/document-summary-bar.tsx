import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

type Tone = "default" | "danger" | "success" | "muted";

export type SummaryMetric = {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
  /** Small line under the value — a due date, a count, a method. */
  hint?: React.ReactNode;
};

type DocumentSummaryBarProps = {
  primary: SummaryMetric;
  /** Shown to the right of the primary figure, separated by a rule. */
  metrics?: SummaryMetric[];
  progress?: { value: number; tone?: Tone };
  actions?: React.ReactNode;
};

const toneText: Record<Tone, string> = {
  default: "",
  muted: "text-muted-foreground",
  danger: "text-red-600 dark:text-red-400",
  success: "text-emerald-600 dark:text-emerald-400",
};

const toneBar: Record<Tone, string> = {
  default: "bg-primary",
  muted: "bg-muted-foreground/40",
  danger: "bg-red-500",
  success: "bg-emerald-500",
};

/**
 * The money line: the one row that answers "where does this document
 * stand" before anything else on the page.
 *
 * Replaces SummaryHero on document pages. Same information, roughly a
 * third of the height — the hero's 4xl figure and 24px padding made a
 * single number occupy a band as tall as the line items beneath it.
 * SummaryHero stays as-is for the dashboards and entity pages that use
 * it, where a page-dominating number is the point.
 */
export function DocumentSummaryBar({
  primary,
  metrics = [],
  progress,
  actions,
}: DocumentSummaryBarProps) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {primary.label}
          </p>
          <p
            className={cn(
              "mt-0.5 text-2xl font-semibold tabular-nums tracking-tight",
              toneText[primary.tone ?? "default"]
            )}
          >
            {primary.value}
          </p>
          {primary.hint && (
            <p className="text-xs text-muted-foreground">{primary.hint}</p>
          )}
        </div>

        {metrics.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-l pl-6 max-sm:border-l-0 max-sm:pl-0">
            {metrics.map((m) => (
              <div key={m.label} className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {m.label}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-[15px] font-medium tabular-nums",
                    toneText[m.tone ?? "default"]
                  )}
                >
                  {m.value}
                </p>
                {m.hint && (
                  <p className="text-xs text-muted-foreground">{m.hint}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {actions && (
          <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {progress && (
        <div className="h-1 w-full bg-muted">
          <div
            className={cn(
              "h-full transition-[width] duration-500",
              toneBar[progress.tone ?? "default"]
            )}
            style={{ width: `${Math.min(100, Math.max(0, progress.value))}%` }}
          />
        </div>
      )}
    </Card>
  );
}
