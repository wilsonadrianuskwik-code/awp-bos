import { Card, CardContent } from "@/components/ui/card";
import { AnimatedValue } from "@/components/shared/animated-value";
import { RevenueTrendWidget } from "@/features/dashboard/components/revenue-trend-widget";
import type { RevenueTrendPoint } from "@/features/dashboard/types";

type RevenueHeroCardProps = {
  /** Preformatted revenue-this-month amount(s). */
  value: string;
  points: RevenueTrendPoint[];
  currency: string;
};

// The dashboard's hero: the number the business runs on, at display
// scale, sitting directly above its own 90-day context — the Stripe
// composition (big figure + trend in one surface) instead of a small
// tile here and a disconnected chart there.
export function RevenueHeroCard({ value, points, currency }: RevenueHeroCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Revenue This Month
        </p>
        <AnimatedValue
          value={value}
          className="mt-2 block truncate text-4xl font-semibold tracking-tight tabular-nums"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Payments received · weekly, last 90 days
        </p>
        <div className="mt-5">
          <RevenueTrendWidget points={points} currency={currency} />
        </div>
      </CardContent>
    </Card>
  );
}
