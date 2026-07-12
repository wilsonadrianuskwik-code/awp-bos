"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { DateRangePicker, type DateRange } from "@/components/ui/date-range-picker";
import { CurrencySelector } from "@/features/reports/components/currency-selector";
import { RevenueChart } from "@/features/reports/components/revenue-chart";

function defaultDateRange(): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 29);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

type ReportsPageProps = {
  workspaceId: string;
  availableCurrencies: string[];
  defaultCurrency: string;
};

export function ReportsPage({
  workspaceId,
  availableCurrencies,
  defaultCurrency,
}: ReportsPageProps) {
  const [currency, setCurrency] = useState(
    availableCurrencies.includes(defaultCurrency)
      ? defaultCurrency
      : (availableCurrencies[0] ?? defaultCurrency)
  );
  const [dateRange, setDateRange] = useState<DateRange>(defaultDateRange);

  if (availableCurrencies.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No report data yet"
        description="Reports fill in once you have invoices or payments recorded."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <CurrencySelector
          currencies={availableCurrencies}
          value={currency}
          onChange={setCurrency}
        />
      </div>

      {/* AR Aging is filled in by Milestone 4; this shell establishes the
          shared date-range/currency state and the section layout both
          reports (and any future report) plug into. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueChart
              workspaceId={workspaceId}
              currency={currency}
              dateRange={dateRange}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">AR Aging</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{currency} · as of today</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
