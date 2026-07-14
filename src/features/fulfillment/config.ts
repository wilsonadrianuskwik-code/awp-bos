// Operational tuning constants for the Fulfillment module. Kept in one
// named place so each can later be promoted to a per-workspace setting
// without touching UI logic: the server page reads the value here (or, in
// future, a workspace setting) and threads it down as a prop, so the
// components never reference the constant directly.

/**
 * Days without a delivery event after which an active tracker is treated as
 * "stalled" in the Operations Cockpit. Not hardcoded in the UI — the
 * fulfillment page reads this and passes it down as `stalledAfterDays`, so
 * swapping the source for a workspace setting later is a one-line change in
 * the page and nothing in the components.
 */
export const FULFILLMENT_STALLED_AFTER_DAYS = 14;

/**
 * How many trackers the cockpit fetches in one batch. The cockpit does all
 * grouping/filtering/sorting client-side over this batch (no per-keystroke
 * server round trips), so a client's trackers are never split across a
 * page boundary. If a workspace ever exceeds this, the fix is raising this
 * number or adding server-side per-client aggregation — not a schema change.
 */
export const FULFILLMENT_COCKPIT_BATCH_SIZE = 400;
