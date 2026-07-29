import { cn } from "@/lib/utils/cn";

// The status system: every lifecycle state in the product maps to one of
// six semantic tones, so "money received", "deal won", and "work
// completed" all read as the same green across modules — the consistency
// is what makes states legible at a glance. Rendering is a soft tint +
// hairline ring + leading dot (GitHub/Linear convention), never a solid
// saturated fill.
export type Tone = "neutral" | "info" | "attention" | "success" | "danger" | "special";

// Fixed hex equivalents of the Tailwind tone classes below, for contexts
// that can't use Tailwind (the generated-PDF renderer, which emits raw
// inline `style="..."` HTML). Keeping this next to TONE_CLASSES/
// STATUS_TONE means a print doc and the app UI always agree on what color
// a given status is — previously the renderer hardcoded its own
// independent status->hex map that could (and did) silently drift from
// this one.
export const TONE_HEX: Record<Tone, { bg: string; text: string }> = {
  neutral: { bg: "#f1f5f9", text: "#475569" },
  info: { bg: "#dbeafe", text: "#1d4ed8" },
  attention: { bg: "#fef3c7", text: "#b45309" },
  success: { bg: "#dcfce7", text: "#15803d" },
  danger: { bg: "#fee2e2", text: "#b91c1c" },
  special: { bg: "#ede9fe", text: "#6d28d9" },
};

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

/**
 * The left-edge accent a table row carries for a given tone. Muted well
 * below the badge — the badge states the status, the stripe only lets
 * you find it while scanning a long list.
 */
export const TONE_ROW_ACCENT: Record<Tone, string> = {
  neutral: "before:bg-slate-300 dark:before:bg-slate-600",
  info: "before:bg-blue-500",
  attention: "before:bg-amber-500",
  success: "before:bg-emerald-500",
  danger: "before:bg-red-500",
  special: "before:bg-violet-500",
};

export const STATUS_TONE: Record<string, Tone> = {
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
  // Fulfilment Project lifecycle
  not_started: "neutral",
  // Deliverable (posting schedule) lifecycle
  scheduled: "neutral",
  posted: "success",
  // Proforma invoice lifecycle
  accepted: "success",
  converted: "special",
  // Delivery order lifecycle
  prepared: "info",
  dispatched: "attention",
  delivered: "success",
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
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset transition-colors duration-200",
        TONE_CLASSES[tone],
        className
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}
