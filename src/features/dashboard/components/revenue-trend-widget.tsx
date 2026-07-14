"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { RevenueTrendPoint } from "@/features/dashboard/types";

function formatPeriodLabel(period: string): string {
  return new Date(period).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

type RevenueTrendWidgetProps = {
  points: RevenueTrendPoint[];
  currency: string;
};

/**
 * Fixed, non-interactive version of reports/components/revenue-chart.tsx
 * — last 90 days, weekly buckets, no granularity tabs or date/currency
 * controls. The dashboard is a fast at-a-glance summary; Reports is
 * where the configurable analysis lives.
 */
export function RevenueTrendWidget({ points, currency }: RevenueTrendWidgetProps) {
  if (points.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No revenue recorded in the last 90 days.
      </p>
    );
  }

  const chartData = points.map((p) => ({
    label: formatPeriodLabel(p.period),
    total: p.total,
  }));

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => formatCurrency(v, currency)}
            width={70}
          />
          <Tooltip formatter={(value) => formatCurrency(Number(value), currency)} />
          <Bar dataKey="total" fill="currentColor" radius={[4, 4, 0, 0]} className="text-primary" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
