"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getRevenueByPeriodAction } from "@/features/reports/actions";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { DateRange } from "@/components/ui/date-range-picker";
import type { ReportGranularity, RevenuePeriodPoint } from "@/features/reports/types";

// Beyond this many days, "day" granularity would return too many bars to
// read (or usefully render) — the day option is disabled rather than
// silently returning hundreds of buckets.
const MAX_DAYS_FOR_DAILY_GRANULARITY = 90;

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000
  );
}

function formatPeriodLabel(period: string, granularity: ReportGranularity): string {
  const date = new Date(period);
  if (granularity === "month") {
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type RevenueChartProps = {
  workspaceId: string;
  currency: string;
  dateRange: DateRange;
};

export function RevenueChart({ workspaceId, currency, dateRange }: RevenueChartProps) {
  const rangeDays = daysBetween(dateRange.from, dateRange.to);
  const dailyAllowed = rangeDays <= MAX_DAYS_FOR_DAILY_GRANULARITY;

  const [granularity, setGranularity] = useState<ReportGranularity>(
    dailyAllowed ? "day" : "month"
  );
  const [points, setPoints] = useState<RevenuePeriodPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // If the range widens past the daily threshold while "day" is selected,
  // fall back to "month" rather than requesting an unbounded bucket count.
  useEffect(() => {
    if (!dailyAllowed && granularity === "day") setGranularity("month");
  }, [dailyAllowed, granularity]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getRevenueByPeriodAction(workspaceId, {
      currency,
      granularity,
      fromDate: dateRange.from,
      toDate: dateRange.to,
    }).then((result) => {
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
        setPoints([]);
      } else {
        setPoints(result.data ?? []);
      }
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [workspaceId, currency, granularity, dateRange.from, dateRange.to]);

  const chartData = points.map((p) => ({
    label: formatPeriodLabel(p.period, granularity),
    total: p.total,
  }));

  return (
    <div className="space-y-3">
      <Tabs
        value={granularity}
        onValueChange={(v) => setGranularity(v as ReportGranularity)}
      >
        <TabsList>
          <TabsTrigger value="day" disabled={!dailyAllowed}>
            Day
          </TabsTrigger>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
        </TabsList>
      </Tabs>

      {!dailyAllowed && (
        <p className="text-xs text-muted-foreground">
          Daily granularity is available for ranges of {MAX_DAYS_FOR_DAILY_GRANULARITY}{" "}
          days or fewer.
        </p>
      )}

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="py-8 text-center text-sm text-destructive">{error}</p>
      ) : chartData.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No revenue recorded for this period.
        </p>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatCurrency(v, currency)}
                width={80}
              />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value), currency)}
              />
              <Bar dataKey="total" fill="currentColor" radius={[4, 4, 0, 0]} className="text-primary" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
