"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClientSelector } from "@/features/line-items/components/client-selector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/providers/workspace-provider";
import { getInvoicesForClientAction } from "@/features/fulfillment-projects/actions";
import type { ClientSummary } from "@/features/line-items/types";
import type { Invoice } from "@/features/invoices/types";

type ClientInvoicePickerProps = {
  clients: ClientSummary[];
  // Pre-selected when arriving at /fulfillment-projects/[invoiceId] — used
  // to seed both dropdowns without an extra round trip.
  initialClientId?: string;
  initialInvoiceId?: string;
};

// The primary entry point into the Fulfilment workspace: pick a client,
// pick one of their invoices, land on that invoice's project. Kept as a
// persistent bar at the top of the page (not a separate screen) so
// switching projects is an in-place selection, not a list->detail hop.
export function ClientInvoicePicker({
  clients,
  initialClientId,
  initialInvoiceId,
}: ClientInvoicePickerProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const [isPending, startTransition] = useTransition();
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    setLoadingInvoices(true);
    getInvoicesForClientAction(workspace.id, clientId).then((res) => {
      setInvoices(res.data ?? []);
      setLoadingInvoices(false);
    });
  }, [clientId, workspace.id]);

  function handleClientChange(id: string) {
    setClientId(id);
    setInvoices([]);
  }

  function handleInvoiceChange(invoiceId: string) {
    startTransition(() => {
      router.push(`/${workspace.slug}/fulfillment-projects/${invoiceId}`);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-1.5">
        <Label>Client</Label>
        <ClientSelector clients={clients} value={clientId} onChange={handleClientChange} />
      </div>
      <div className="flex-1 space-y-1.5">
        <Label>Invoice</Label>
        <Select
          value={initialInvoiceId ?? ""}
          onValueChange={handleInvoiceChange}
          disabled={!clientId || isPending}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !clientId
                  ? "Select a client first"
                  : loadingInvoices
                    ? "Loading invoices…"
                    : invoices.length === 0
                      ? "This client has no invoices"
                      : "Select an invoice…"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {invoices.map((inv) => (
              <SelectItem key={inv.id} value={inv.id}>
                {inv.invoice_number} · {inv.status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
