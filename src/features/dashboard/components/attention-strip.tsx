import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { AttentionItem } from "@/features/dashboard/queries";

/**
 * The command-center dashboard's top row — exceptions first, not last.
 * Uses the accent-alert (safety-orange) channel reserved specifically
 * for items requiring action, distinct from the primary cobalt accent
 * used everywhere else. Empty state is calm, never a fabricated graphic.
 */
export function AttentionStrip({
  items,
  workspaceSlug,
}: {
  items: AttentionItem[];
  workspaceSlug: string;
}) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-[13px] text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        Nothing needs your attention.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      {items.map((item) => (
        <Link
          key={item.label}
          href={`/${workspaceSlug}${item.href}`}
          className="rounded-md border border-amber-500/30 bg-card px-2.5 py-1 text-[13px] font-medium text-amber-700 transition-colors hover:bg-amber-500/10 dark:text-amber-300"
        >
          <span className="tabular-nums">{item.count}</span> {item.label}
        </Link>
      ))}
    </div>
  );
}
