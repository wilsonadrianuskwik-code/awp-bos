"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { LEAD_STATUSES, type Lead, type LeadStatus } from "@/features/leads/types";

type LeadPipelineProps = {
  leads: Lead[];
};

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export function LeadPipeline({ leads }: LeadPipelineProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();

  const grouped = LEAD_STATUSES.reduce(
    (acc, status) => {
      acc[status] = leads.filter((l) => l.status === status);
      return acc;
    },
    {} as Record<LeadStatus, Lead[]>
  );

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {LEAD_STATUSES.map((status) => (
        <div key={status} className="w-72 shrink-0">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{STATUS_LABELS[status]}</h3>
            <span className="text-xs text-muted-foreground">
              {grouped[status].length}
            </span>
          </div>
          <div className="space-y-2">
            {grouped[status].length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                No leads
              </div>
            ) : (
              grouped[status].map((lead) => (
                <Card
                  key={lead.id}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() =>
                    router.push(`/${workspace.slug}/leads/${lead.id}`)
                  }
                >
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-sm">{lead.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    {lead.company && (
                      <p className="text-xs text-muted-foreground">
                        {lead.company}
                      </p>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      {lead.expected_value != null ? (
                        <span className="text-xs font-medium">
                          {new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: "USD",
                          }).format(lead.expected_value)}
                        </span>
                      ) : (
                        <span />
                      )}
                      {lead.source && (
                        <StatusBadge status={lead.source} />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
