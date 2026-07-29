import Link from "next/link";
import { ArrowUpRight, Landmark, Wallet, AlertCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AnimatedValue } from "@/components/shared/animated-value";
import { cn } from "@/lib/utils/cn";

export type RibbonMetric = {
  label: string;
  value: string;
  description?: string;
  href?: string;
  tone?: "default" | "danger" | "success";
  /** Overrides the tone's default icon. */
  icon?: LucideIcon;
};

/**
 * A tinted circle behind an icon, per tone — the reference's signature
 * stat-card device. The colour carries the meaning at a glance, so the
 * number itself doesn't have to shout.
 */
const TONE: Record<
  string,
  { icon: LucideIcon; circle: string; value: string }
> = {
  default: {
    icon: Landmark,
    circle: "bg-primary/10 text-primary",
    value: "text-foreground",
  },
  success: {
    icon: Wallet,
    circle: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    value: "text-foreground",
  },
  danger: {
    icon: AlertCircle,
    circle: "bg-red-500/10 text-red-600 dark:text-red-400",
    value: "text-red-600 dark:text-red-400",
  },
};

/**
 * Separate floating cards rather than one divided strip: on a soft
 * canvas, individually-floating cards read as the airy dashboard this
 * design is built around, where a single bordered block reads as a
 * table header.
 */
export function MetricsRibbon({ metrics }: { metrics: RibbonMetric[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {metrics.map((m) => {
        const tone = TONE[m.tone ?? "default"] ?? TONE.default;
        const Icon = m.icon ?? tone.icon;

        const body = (
          <div className="flex items-center gap-4 rounded-2xl bg-card p-5 shadow-card transition-shadow duration-150 group-hover:shadow-overlay">
            <span
              className={cn(
                "grid h-14 w-14 shrink-0 place-items-center rounded-full",
                tone.circle
              )}
            >
              <Icon className="h-6 w-6" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[13px] text-muted-foreground">
                  {m.label}
                </span>
                {m.href && (
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-transparent transition-colors group-hover:text-primary" />
                )}
              </div>
              <AnimatedValue
                value={m.value}
                className={cn(
                  "mt-1 block truncate text-2xl font-semibold tracking-tight tabular-nums",
                  tone.value
                )}
              />
              {m.description && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {m.description}
                </p>
              )}
            </div>
          </div>
        );

        return m.href ? (
          <Link key={m.label} href={m.href} className="group min-w-0 outline-none">
            {body}
          </Link>
        ) : (
          <div key={m.label} className="group min-w-0">
            {body}
          </div>
        );
      })}
    </div>
  );
}
