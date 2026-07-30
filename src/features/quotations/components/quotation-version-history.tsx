"use client";

import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/format-currency";
import { useWorkspace } from "@/providers/workspace-provider";
import type { QuotationWithClient } from "@/features/quotations/types";
import { formatDate } from "@/lib/utils/date";

type QuotationVersionHistoryProps = {
  versions: QuotationWithClient[];
  currentId: string;
};

export function QuotationVersionHistory({
  versions,
  currentId,
}: QuotationVersionHistoryProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();

  if (versions.length <= 1) {
    return (
      <p className="text-sm text-muted-foreground">No other versions yet.</p>
    );
  }

  return (
    <div className="space-y-2">
      {versions.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => router.push(`/${workspace.slug}/quotations/${v.id}`)}
          className={cn(
            "flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-accent",
            v.id === currentId && "border-foreground/30 bg-muted"
          )}
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">
              V{v.version} · {v.quotation_number}
              {v.id === currentId && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  (viewing)
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDate(v.created_at)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm tabular-nums">
              {formatCurrency(v.total)}
            </span>
            <StatusBadge status={v.status} />
          </div>
        </button>
      ))}
    </div>
  );
}
