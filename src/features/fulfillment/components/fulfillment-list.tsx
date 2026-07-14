"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ClientFulfillmentGroup } from "@/features/fulfillment/components/client-fulfillment-group";
import { RecordDeliveryDialog } from "@/features/fulfillment/components/record-delivery-dialog";
import { FULFILLMENT_STATUSES } from "@/features/fulfillment/types";
import type { FulfillmentItemWithProgress } from "@/features/fulfillment/types";

const STATUS_TABS = [
  { value: "all", label: "All" },
  ...FULFILLMENT_STATUSES.map((s) => ({
    value: s,
    label: s.replace(/_/g, " "),
  })),
] as const;

const ACTIVE_STATUSES = new Set(["pending", "in_progress"]);

type ClientGroup = {
  clientId: string;
  clientName: string;
  items: FulfillmentItemWithProgress[];
};

type FulfillmentListProps = {
  items: FulfillmentItemWithProgress[];
  totalCount: number;
};

// Client-centric ledger: trackers are grouped into a collapsible section
// per client rather than a flat table, so "what does this client still
// need delivered" is answerable at a glance — clients with active work
// sort first and start expanded; fully-complete clients collapse out of
// the way by default. Filtering by client is a client-side search over
// the already-fetched batch (see the page's GROUPED_VIEW_BATCH_SIZE
// comment) rather than a new server round trip.
export function FulfillmentList({ items, totalCount }: FulfillmentListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = searchParams.get("status") ?? "all";
  const [clientSearch, setClientSearch] = useState("");
  const [recordingItem, setRecordingItem] = useState<FulfillmentItemWithProgress | null>(
    null
  );

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const groups = useMemo(() => {
    const byClient = new Map<string, ClientGroup>();
    for (const item of items) {
      const existing = byClient.get(item.client_id);
      if (existing) {
        existing.items.push(item);
      } else {
        byClient.set(item.client_id, {
          clientId: item.client_id,
          clientName: item.client_name,
          items: [item],
        });
      }
    }

    const term = clientSearch.trim().toLowerCase();
    const filtered = term
      ? [...byClient.values()].filter((g) =>
          g.clientName.toLowerCase().includes(term)
        )
      : [...byClient.values()];

    return filtered.sort((a, b) => {
      const aActive = a.items.some((i) => ACTIVE_STATUSES.has(i.status));
      const bActive = b.items.some((i) => ACTIVE_STATUSES.has(i.status));
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.clientName.localeCompare(b.clientName);
    });
  }, [items, clientSearch]);

  const activeClientCount = groups.filter((g) =>
    g.items.some((i) => ACTIVE_STATUSES.has(i.status))
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() =>
                setParams({ status: tab.value === "all" ? null : tab.value })
              }
              className={
                status === tab.value
                  ? "shrink-0 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium capitalize text-background"
                  : "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium capitalize text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
            placeholder="Search client..."
            className="h-9 pl-9"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {groups.length} client{groups.length === 1 ? "" : "s"} · {totalCount} tracker
        {totalCount === 1 ? "" : "s"}
        {activeClientCount > 0
          ? ` · ${activeClientCount} client${activeClientCount === 1 ? "" : "s"} with active work`
          : ""}
      </p>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          No fulfillment trackers match your filters.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <ClientFulfillmentGroup
              key={group.clientId}
              clientId={group.clientId}
              clientName={group.clientName}
              items={group.items}
              defaultOpen={group.items.some((i) => ACTIVE_STATUSES.has(i.status))}
              onRecordDelivery={setRecordingItem}
            />
          ))}
        </div>
      )}

      {recordingItem && (
        <RecordDeliveryDialog
          open={!!recordingItem}
          onOpenChange={(open) => !open && setRecordingItem(null)}
          fulfillmentItemId={recordingItem.id}
          description={recordingItem.description}
          invoiceId={recordingItem.invoice_id}
          invoiceNumber={recordingItem.invoice_number}
          clientId={recordingItem.client_id}
          clientName={recordingItem.client_name}
          purchased={recordingItem.purchased}
          delivered={recordingItem.delivered}
          remaining={recordingItem.remaining}
          unitLabel={recordingItem.unit}
        />
      )}
    </div>
  );
}
