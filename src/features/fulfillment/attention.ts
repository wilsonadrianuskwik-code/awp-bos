import type { FulfillmentItemWithProgress } from "@/features/fulfillment/types";

// Pure, React-free operational logic shared by the cockpit's queue, KPIs,
// and cards. Keeping it here (not inside a component) makes the "what needs
// attention" rules a single source of truth and trivially testable.

export type TrackerVisualState =
  | "over" // delivered beyond purchased — flagged, wins over "completed"
  | "completed"
  | "stalled" // active but no delivery in >= stalledAfterDays
  | "in_progress"
  | "pending";

// The Operations Inbox is more than a stalled filter — these are the
// reasons a tracker surfaces for a human's awareness/action. `due_soon` is
// intentionally listed but never computed yet: it's the reserved slot for
// the future Scheduling extension (see ATTENTION_REASONS / the disabled
// chip in the UI), so adding scheduling later needs no rework here.
export type AttentionReason =
  | "stalled"
  | "over"
  | "remaining"
  | "today"
  | "due_soon";

export const ATTENTION_REASONS: {
  key: Exclude<AttentionReason, "due_soon">;
  label: string;
}[] = [
  { key: "stalled", label: "Stalled" },
  { key: "over", label: "Over-delivered" },
  { key: "remaining", label: "Remaining work" },
  { key: "today", label: "Updated today" },
];

export function isActive(t: FulfillmentItemWithProgress): boolean {
  return t.status === "pending" || t.status === "in_progress";
}

export function daysSinceUpdated(t: FulfillmentItemWithProgress): number {
  const then = new Date(t.updated_at).getTime();
  return Math.floor((Date.now() - then) / 86_400_000);
}

export function isUpdatedToday(t: FulfillmentItemWithProgress): boolean {
  const d = new Date(t.updated_at);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function isStalled(
  t: FulfillmentItemWithProgress,
  stalledAfterDays: number
): boolean {
  return isActive(t) && daysSinceUpdated(t) >= stalledAfterDays;
}

// The single visual state a card/tag renders. Over-delivered deliberately
// outranks "completed" so an over-delivery is never hidden behind a plain
// "Completed" tag.
export function trackerState(
  t: FulfillmentItemWithProgress,
  stalledAfterDays: number
): TrackerVisualState {
  if (t.is_over_delivered) return "over";
  if (t.status === "completed") return "completed";
  if (isStalled(t, stalledAfterDays)) return "stalled";
  if (t.status === "in_progress") return "in_progress";
  return "pending";
}

export function trackerReasons(
  t: FulfillmentItemWithProgress,
  stalledAfterDays: number
): Set<AttentionReason> {
  const reasons = new Set<AttentionReason>();
  if (t.is_over_delivered) reasons.add("over");
  if (isStalled(t, stalledAfterDays)) reasons.add("stalled");
  if (isActive(t) && t.remaining > 0) reasons.add("remaining");
  if (isUpdatedToday(t)) reasons.add("today");
  return reasons;
}
