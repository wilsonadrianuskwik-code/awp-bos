import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  deriveLifecycleStages,
  formatTimelineTimestamp,
  type LifecycleStageTone,
} from "@/features/quotations/helpers";
import type { Quotation } from "@/features/quotations/types";
import type { Activity } from "@/features/activities/types";

type QuotationLifecycleTimelineProps = {
  quotation: Quotation;
  activities: Activity[];
};

const TONE_DOT: Record<LifecycleStageTone, string> = {
  neutral: "bg-foreground",
  success: "bg-emerald-500",
  danger: "bg-red-500",
  warning: "bg-amber-500",
};

const TONE_TEXT: Record<LifecycleStageTone, string> = {
  neutral: "text-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  danger: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
};

export function QuotationLifecycleTimeline({
  quotation,
  activities,
}: QuotationLifecycleTimelineProps) {
  const stages = deriveLifecycleStages(quotation, activities);

  return (
    <div>
      {stages.map((stage, i) => {
        const isLast = i === stages.length - 1;
        const isMuted = stage.state === "pending" || stage.state === "skipped";

        return (
          <div key={stage.key} className="relative flex gap-3 pb-6 last:pb-0">
            {!isLast && (
              <span className="absolute left-[9px] top-5 h-full w-px bg-border" />
            )}
            <span
              className={cn(
                "relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-transparent",
                stage.state === "done" && TONE_DOT[stage.tone],
                stage.state === "current" &&
                  "border-2 border-dashed border-foreground/40 bg-background",
                isMuted && "border-2 border-border bg-background"
              )}
            >
              {stage.state === "done" && <Check className="h-3 w-3 text-white" />}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  isMuted ? "text-muted-foreground" : TONE_TEXT[stage.tone]
                )}
              >
                {stage.label}
                {stage.state === "skipped" && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    (skipped)
                  </span>
                )}
              </p>
              {stage.timestamp && (
                <p className="text-xs text-muted-foreground">
                  {formatTimelineTimestamp(stage.timestamp)}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
