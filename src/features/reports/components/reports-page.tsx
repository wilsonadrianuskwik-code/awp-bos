"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { DateRangePicker, type DateRange } from "@/components/ui/date-range-picker";
import { RevenueChart } from "@/features/reports/components/revenue-chart";
import { ArAgingCard } from "@/features/reports/components/ar-aging-card";
import { ApAgingCard } from "@/features/reports/components/ap-aging-card";
import { CatalogRevenueCard } from "@/features/reports/components/catalog-revenue-card";
import { FulfillmentOverviewCard } from "@/features/reports/components/fulfillment-overview-card";
import { ProjectProfitabilityCard } from "@/features/reports/components/project-profitability-card";
import { PurchaseOrderStatusCard } from "@/features/reports/components/purchase-order-status-card";
import { DeliveryPerformanceCard } from "@/features/reports/components/delivery-performance-card";

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
  workspaceSlug: string;
  hasData: boolean;
};

export function ReportsPage({
  workspaceId,
  workspaceSlug,
  hasData,
}: ReportsPageProps) {
  const [dateRange, setDateRange] = useState<DateRange>(defaultDateRange);

  if (!hasData) {
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
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueChart
              workspaceId={workspaceId}
              dateRange={dateRange}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">AR Aging</CardTitle>
          </CardHeader>
          <CardContent>
            <ArAgingCard workspaceId={workspaceId} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Catalog Items</CardTitle>
          </CardHeader>
          <CardContent>
            <CatalogRevenueCard
              workspaceId={workspaceId}
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">AP Aging</CardTitle>
          </CardHeader>
          <CardContent>
            <ApAgingCard workspaceId={workspaceId} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Purchase Order Status</CardTitle>
          </CardHeader>
          <CardContent>
            <PurchaseOrderStatusCard workspaceId={workspaceId} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delivery Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <DeliveryPerformanceCard
              workspaceId={workspaceId}
              fromDate={dateRange.from}
              toDate={dateRange.to}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Project Profitability</CardTitle>
          </CardHeader>
          <CardContent>
            <ProjectProfitabilityCard workspaceId={workspaceId} workspaceSlug={workspaceSlug} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
