// PO-specific helpers are deliberately minimal — totals math is entirely
// owned by computeLineItemTotals (@/features/line-items/helpers), reused
// unchanged by the Purchase Order builder just like the invoice builder.

import type { PurchaseOrderStatus } from "@/features/purchase-orders/types";

export const PURCHASE_ORDER_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  acknowledged: "Acknowledged",
  partially_received: "Partially Received",
  received: "Received",
  cancelled: "Cancelled",
};
