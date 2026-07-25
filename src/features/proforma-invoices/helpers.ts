import type { ProformaInvoiceStatus } from "@/features/proforma-invoices/types";

export const VALID_TRANSITIONS: Record<ProformaInvoiceStatus, ProformaInvoiceStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["accepted", "expired", "cancelled"],
  accepted: ["converted", "cancelled"],
  expired: [],
  cancelled: [],
  converted: [],
};

export function isEditableStatus(status: ProformaInvoiceStatus): boolean {
  return status === "draft";
}

export function canTransition(
  from: ProformaInvoiceStatus,
  to: ProformaInvoiceStatus
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
