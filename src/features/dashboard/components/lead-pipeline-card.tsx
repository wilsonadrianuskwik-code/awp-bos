import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import type { LeadSummary } from "@/features/dashboard/types";

// Deliberately local, not imported from the leads feature — same
// isolation rule already established for ClientQuotationSummary/
// ClientInvoiceSummary in client-detail.tsx. Order mirrors the leads
// feature's own LEAD_STATUSES pipeline order.
const LEAD_STATUS_ORDER = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
] as const;

type LeadPipelineCardProps = {
  summary: LeadSummary;
};

export function LeadPipelineCard({ summary }: LeadPipelineCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Lead Pipeline</CardTitle>
      </CardHeader>
      <CardContent>
        {summary.total === 0 ? (
          <p className="text-sm text-muted-foreground">No leads yet.</p>
        ) : (
          <div className="space-y-2.5">
            {LEAD_STATUS_ORDER.filter((status) => summary.byStatus[status] > 0).map(
              (status) => (
                <div
                  key={status}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <StatusBadge status={status} />
                  {/* Proportional track: share of the pipeline at a glance,
                      without the reader doing division. */}
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="animate-grow-x block h-full rounded-full bg-primary/60"
                      style={{
                        width: `${Math.max(4, Math.round((summary.byStatus[status] / summary.total) * 100))}%`,
                      }}
                    />
                  </span>
                  <span className="tabular-nums font-medium">
                    {summary.byStatus[status]}
                  </span>
                </div>
              )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
