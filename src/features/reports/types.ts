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
