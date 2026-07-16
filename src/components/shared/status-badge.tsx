import { cn } from "@/lib/utils/cn";

// The status system: every lifecycle state in the product maps to one of
// six semantic tones, so "money received", "deal won", and "work
// completed" all read as the same green across modules — the consistency
// is what makes states legible at a glance. Rendering is a soft tint +
// hairline ring + leading dot (GitHub/Linear convention), never a solid
// saturated fill.
type Tone = "neutral" | "info" | "attention" | "success" | "danger" | "special";

const TONE_CLASSES: Record<Tone, string> = {
  neutral:
    "bg-slate-50 text-slate-600 ring-slate-500/20 dark:bg-slate-400/10 dark:text-slate-400 dark:ring-slate-400/20",
  info:
    "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-400/10 dark:text-blue-400 dark:ring-blue-400/20",
  attention:
    "bg-amber-50 text-amber-700 ring-amber-600/25 dark:bg-amber-400/10 dark:text-amber-400 dark:ring-amber-400/20",
  success:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-400 dark:ring-emerald-400/20",
  danger:
    "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/20",
  special:
    "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-400/10 dark:text-violet-400 dark:ring-violet-400/20",
};

const STATUS_TONE: Record<string, Tone> = {
  // Leads
  new: "info",
  contacted: "attention",
  qualified: "special",
  proposal: "info",
  negotiation: "attention",
  won: "success",
  lost: "danger",
  // Clients / catalog
  active: "success",
  inactive: "neutral",
  // Quotation lifecycle
  draft: "neutral",
  sent: "info",
  viewed: "special",
  approved: "success",
  rejected: "danger",
  expired: "attention",
  cancelled: "neutral",
  revision_requested: "attention",
  // Invoice lifecycle
  partial: "attention",
  paid: "success",
  overdue: "danger",
  refunded: "special",
  // Fulfillment lifecycle
  pending: "neutral",
  in_progress: "info",
  completed: "success",
};

type StatusBadgeProps = {
  status: string;
  className?: string;
  // Overrides the displayed text (still colored by `status`) — used for
  // the invoice "Overdue • N days" display.
  label?: string;
};

export function StatusBadge({ status, className, label }: StatusBadgeProps) {
  const tone = STATUS_TONE[status] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset",
        TONE_CLASSES[tone],
        className
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}
