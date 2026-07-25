import Link from "next/link";
import { Card } from "@/components/ui/card";
import { CheckCircle2, FileText, ClipboardList, PackageCheck } from "lucide-react";
import type { ActionQueueItem } from "@/features/dashboard/queries";

const TYPE_ICON = {
  quotation: FileText,
  proforma_invoice: FileText,
  purchase_order: ClipboardList,
  delivery_order: PackageCheck,
} as const;

/**
 * "Documents awaiting your action" — a personal to-do view generated
 * from document status, replacing a chart with the actual next-step
 * list an ERP user opens the dashboard to find (master plan §8.3).
 */
export function ActionQueueCard({
  items,
  workspaceSlug,
}: {
  items: ActionQueueItem[];
  workspaceSlug: string;
}) {
  return (
    <Card className="p-4">
      <h3 className="text-[15px] font-semibold">Action Queue</h3>
      {items.length === 0 ? (
        <div className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          Nothing awaiting your action.
        </div>
      ) : (
        <ul className="mt-3 space-y-0.5">
          {items.map((item) => {
            const Icon = TYPE_ICON[item.type];
            return (
              <li key={`${item.type}-${item.id}`}>
                <Link
                  href={`/${workspaceSlug}${item.href}`}
                  className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-muted/40"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
