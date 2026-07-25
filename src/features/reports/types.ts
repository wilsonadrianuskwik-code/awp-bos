// Cross-cutting, like dashboard/line-items/activities — queries the
// underlying invoices/payments tables directly (or via the read-only
// reporting RPCs) rather than importing the invoices/quotations features.

export const REPORT_GRANULARITIES = ["day", "week", "month"] as const;

export type ReportGranularity = (typeof REPORT_GRANULARITIES)[number];

export type RevenuePeriodPoint = {
  period: string;
  total: number;
};

export const AR_AGING_BUCKETS = ["current", "1-30", "31-60", "61+"] as const;

export type ArAgingBucketLabel = (typeof AR_AGING_BUCKETS)[number];

export type ArAgingBucket = {
  bucket: ArAgingBucketLabel;
  invoiceCount: number;
  outstandingAmount: number;
};

export type AvailableCurrencies = string[];

export type CatalogRevenueRow = {
  catalogItemId: string;
  catalogItemName: string;
  quantity: number;
  total: number;
};

export const FULFILLMENT_OVERVIEW_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type FulfillmentOverviewRow = {
  status: (typeof FULFILLMENT_OVERVIEW_STATUSES)[number];
  itemCount: number;
  totalRemaining: number;
};

export type ApAgingBucket = {
  bucket: ArAgingBucketLabel;
  poCount: number;
  outstandingAmount: number;
};

export type ProjectProfitabilityRow = {
  projectId: string;
  projectCode: string;
  projectName: string;
  currency: string;
  invoicedTotal: number;
  paidTotal: number;
  poCostTotal: number;
  budget: number | null;
};

export type PurchaseOrderStatusSummaryRow = {
  status: string;
  poCount: number;
  /** Totals keyed by currency code — POs aren't converted across currencies. */
  totalByCurrency: Record<string, number>;
};

export type DeliveryPerformanceRow = {
  status: string;
  doCount: number;
  /** Null until a delivery order has actually moved past creation. */
  avgDaysToDeliver: number | null;
};
