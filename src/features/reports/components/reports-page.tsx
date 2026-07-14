"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { DateRangePicker, type DateRange } from "@/components/ui/date-range-picker";
import { CurrencySelector } from "@/features/reports/components/currency-selector";
import { RevenueChart } from "@/features/reports/components/revenue-chart";
import { ArAgingCard } from "@/features/reports/components/ar-aging-card";
import { CatalogRevenueCard } from "@/features/reports/components/catalog-revenue-card";
import { FulfillmentOverviewCard } from "@/features/reports/components/fulfillment-overview-card";

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
            <ArAgingCard workspaceId={workspaceId} currency={currency} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Catalog Items</CardTitle>
          </CardHeader>
          <CardContent>
            <CatalogRevenueCard
              workspaceId={workspaceId}
              currency={currency}
              dateRange={dateRange}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fulfillment Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <FulfillmentOverviewCard workspaceId={workspaceId} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
