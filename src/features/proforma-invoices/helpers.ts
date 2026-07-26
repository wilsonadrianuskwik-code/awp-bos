import type { ProformaInvoiceStatus } from "@/features/proforma-invoices/types";

export const VALID_TRANSITIONS: Record<ProformaInvoiceStatus, ProformaInvoiceStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["accepted", "expired", "cancelled"],
  accepted: ["converted", "cancelled"],
  expired: [],
  cancelled: [],
  converted: [],
};

// Mirrors update_proforma_invoice (00087). Once converted, the resulting
// Invoice is the live document and this one is history.
export function isEditableStatus(status: ProformaInvoiceStatus): boolean {
  return !["cancelled", "expired", "converted"].includes(status);
}

export function canTransition(
  from: ProformaInvoiceStatus,
  to: ProformaInvoiceStatus
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
