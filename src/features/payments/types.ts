import type { Payment, PaymentMethod } from "@/features/invoices/types";

// Locally-scoped read type for the workspace-wide ledger — mirrors how
// client-detail.tsx defines local ClientQuotationSummary/ClientInvoiceSummary
// rather than importing another feature's types.
export type PaymentWithContext = Payment & {
  invoice: {
    id: string;
    invoice_number: string;
    status: string;
    client: { id: string; name: string } | null;
  } | null;
};

export type PaymentFilters = {
  search?: string;
  from?: string;
  to?: string;
  currency?: string;
  method?: PaymentMethod | "all";
  clientId?: string;
  page?: number;
  pageSize?: number;
};

export type PaymentListResult = {
  payments: PaymentWithContext[];
  count: number;
};
