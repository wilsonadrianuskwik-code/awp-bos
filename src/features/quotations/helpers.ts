import type { LineItem } from "@/features/line-items/types";
import type { Quotation, QuotationStatus } from "@/features/quotations/types";
import type { Activity } from "@/features/activities/types";

export const VALID_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["viewed", "expired", "cancelled"],
  viewed: ["approved", "rejected", "revision_requested", "expired", "cancelled"],
  revision_requested: ["draft", "sent", "cancelled"],
  approved: [],
  rejected: [],
  expired: [],
  cancelled: [],
};

export function isTerminalStatus(status: QuotationStatus): boolean {
  return (
    status === "approved" ||
    status === "rejected" ||
    status === "expired" ||
    status === "cancelled"
  );
}

export function isEditableStatus(status: QuotationStatus): boolean {
  return status === "draft" || status === "revision_requested";
}

export function canTransition(
  from: QuotationStatus,
  to: QuotationStatus
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------
// Lifecycle timeline (Created → Edited → Sent → Viewed → decision → Invoice)
// ---------------------------------------------------------------------

export type LifecycleStageState = "done" | "current" | "pending" | "skipped";
export type LifecycleStageTone = "neutral" | "success" | "danger" | "warning";

export type LifecycleStage = {
  key: string;
  label: string;
  timestamp: string | null;
  state: LifecycleStageState;
  tone: LifecycleStageTone;
};

function findActivityByPrefix(
  activities: Activity[],
  prefixes: string[]
): Activity | undefined {
  return activities.find((a) =>
    prefixes.some((p) => a.description.toLowerCase().startsWith(p.toLowerCase()))
  );
}

/**
 * Derives the fixed-sequence lifecycle stepper shown on the quotation detail
 * page: Created → Edited → Sent → Viewed → (Approved/Rejected/Revision
 * Requested/Expired/Cancelled) → Invoice Generated. Activities are searched
 * by their known description prefixes (written by the SQL functions in
 * 00015_create_quotation_functions.sql) since audit_logs — which carry
 * structured old/new diffs — are admin-only per RLS and not visible to all
 * staff who should see this timeline.
 */
export function deriveLifecycleStages(
  quotation: Pick<
    Quotation,
    | "status"
    | "created_at"
    | "first_viewed_at"
    | "approved_at"
    | "generated_invoice_id"
  >,
  activities: Activity[]
): LifecycleStage[] {
  const stages: LifecycleStage[] = [];

  stages.push({
    key: "created",
    label: "Created",
    timestamp: quotation.created_at,
    state: "done",
    tone: "neutral",
  });

  const editActivity = findActivityByPrefix(activities, ["updated quotation"]);
  const pastDraft = quotation.status !== "draft";
  stages.push({
    key: "edited",
    label: "Edited",
    timestamp: editActivity?.created_at ?? null,
    state: editActivity ? "done" : pastDraft ? "skipped" : "pending",
    tone: "neutral",
  });

  const sentActivity = findActivityByPrefix(activities, ["sent quotation"]);
  stages.push({
    key: "sent",
    label: "Sent",
    timestamp: sentActivity?.created_at ?? null,
    state: sentActivity ? "done" : "pending",
    tone: "neutral",
  });

  stages.push({
    key: "viewed",
    label: "Viewed",
    timestamp: quotation.first_viewed_at,
    state: quotation.first_viewed_at ? "done" : "pending",
    tone: "neutral",
  });

  if (quotation.status === "approved") {
    stages.push({
      key: "decision",
      label: "Approved",
      timestamp: quotation.approved_at,
      state: "done",
      tone: "success",
    });
  } else if (quotation.status === "rejected") {
    const a = findActivityByPrefix(activities, ["rejected quotation"]);
    stages.push({
      key: "decision",
      label: "Rejected",
      timestamp: a?.created_at ?? null,
      state: "done",
      tone: "danger",
    });
  } else if (quotation.status === "revision_requested") {
    const a = findActivityByPrefix(activities, [
      "requested a revision",
      "requested revision",
    ]);
    stages.push({
      key: "decision",
      label: "Revision Requested",
      timestamp: a?.created_at ?? null,
      state: "current",
      tone: "warning",
    });
  } else if (quotation.status === "expired") {
    const a = findActivityByPrefix(activities, ["expired quotation"]);
    stages.push({
      key: "decision",
      label: "Expired",
      timestamp: a?.created_at ?? null,
      state: "done",
      tone: "warning",
    });
  } else if (quotation.status === "cancelled") {
    const a = findActivityByPrefix(activities, ["cancelled quotation"]);
    stages.push({
      key: "decision",
      label: "Cancelled",
      timestamp: a?.created_at ?? null,
      state: "done",
      tone: "neutral",
    });
  } else {
    stages.push({
      key: "decision",
      label: "Awaiting Decision",
      timestamp: null,
      state: "pending",
      tone: "neutral",
    });
  }

  if (quotation.status === "approved") {
    const a = findActivityByPrefix(activities, [
      "generated invoice",
      "invoice",
    ]);
    stages.push({
      key: "invoice",
      label: "Invoice Generated",
      timestamp: quotation.generated_invoice_id ? a?.created_at ?? null : null,
      state: quotation.generated_invoice_id ? "done" : "pending",
      tone: "success",
    });
  }

  // Promote the first not-yet-reached stage to "current" so the stepper
  // shows exactly one active step, unless the lineage already ended
  // (rejected/expired/cancelled all set their own terminal "done" state).
  const firstPendingIndex = stages.findIndex((s) => s.state === "pending");
  if (firstPendingIndex !== -1) {
    stages[firstPendingIndex] = { ...stages[firstPendingIndex], state: "current" };
  }

  return stages;
}

/**
 * Formats a timestamp for the read-receipt style display ("Viewed / Today
 * 14:31") — Today/Yesterday + 24-hour time for recent events, a full date
 * otherwise.
 */
export function formatTimelineTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (date.toDateString() === now.toDateString()) return `Today ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;

  return `${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })} ${time}`;
}

// ---------------------------------------------------------------------
// Version comparison
// ---------------------------------------------------------------------

export type FieldDiffEntry = {
  field: string;
  label: string;
  previous: string | null;
  current: string | null;
};

const COMPARABLE_FIELDS: { key: keyof Quotation; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "summary", label: "Summary" },
  { key: "currency", label: "Currency" },
  { key: "issue_date", label: "Issue date" },
  { key: "expiry_date", label: "Expiry date" },
  { key: "terms_and_conditions", label: "Terms & Conditions" },
  { key: "notes", label: "Notes" },
];

export function diffQuotationFields(
  previous: Quotation,
  current: Quotation
): FieldDiffEntry[] {
  const diffs: FieldDiffEntry[] = [];
  for (const f of COMPARABLE_FIELDS) {
    const prevVal = (previous[f.key] as string | null) ?? null;
    const currVal = (current[f.key] as string | null) ?? null;
    if (prevVal !== currVal) {
      diffs.push({ field: f.key, label: f.label, previous: prevVal, current: currVal });
    }
  }
  return diffs;
}

export type LineItemDiffEntry = {
  key: string;
  status: "added" | "removed" | "changed" | "unchanged";
  previous?: LineItem;
  current?: LineItem;
  changedFields?: string[];
};

function lineItemKey(item: Pick<LineItem, "category" | "description">): string {
  return `${item.category}::${item.description.trim().toLowerCase()}`;
}

export function diffLineItems(
  previous: LineItem[],
  current: LineItem[]
): LineItemDiffEntry[] {
  const prevMap = new Map(previous.map((i) => [lineItemKey(i), i]));
  const currMap = new Map(current.map((i) => [lineItemKey(i), i]));
  const keys = new Set([...prevMap.keys(), ...currMap.keys()]);
  const entries: LineItemDiffEntry[] = [];

  for (const key of keys) {
    const prev = prevMap.get(key);
    const curr = currMap.get(key);

    if (prev && !curr) {
      entries.push({ key, status: "removed", previous: prev });
      continue;
    }
    if (!prev && curr) {
      entries.push({ key, status: "added", current: curr });
      continue;
    }
    if (prev && curr) {
      const changedFields: string[] = [];
      if (prev.quantity !== curr.quantity) changedFields.push("quantity");
      if (prev.unit_price !== curr.unit_price) changedFields.push("unit price");
      if ((prev.discount_percent ?? 0) !== (curr.discount_percent ?? 0))
        changedFields.push("discount");
      if ((prev.tax_percent ?? 0) !== (curr.tax_percent ?? 0))
        changedFields.push("tax");

      entries.push({
        key,
        status: changedFields.length > 0 ? "changed" : "unchanged",
        previous: prev,
        current: curr,
        changedFields,
      });
    }
  }

  return entries;
}
