// Cross-cutting, like activities/line-items — queries the underlying
// leads/clients/invoices/payments tables directly rather than importing
// each domain feature's own types, preserving feature isolation the same
// way client-detail.tsx's locally-scoped summary types already do.

export type LeadSummary = {
  total: number;
  byStatus: Record<string, number>;
};

export type ClientSummary = {
  activeCount: number;
};

export type CurrencyAmount = {
  currency: string;
  amount: number;
};

export type InvoiceSummary = {
  openCount: number;
  amountDueByCurrency: CurrencyAmount[];
};

export type RevenueSummary = {
  totalByCurrency: CurrencyAmount[];
};
