import { z } from "zod/v4";
import { FULFILLMENT_STATUSES } from "@/features/fulfillment/types";

export const recordFulfillmentEventSchema = z.object({
  // Whole numbers only — remove decimal support unless intentionally added
  // back later (see the matching DB CHECK constraint and
  // record_fulfillment_event's own guard in
  // 00032_fulfillment_workflow_refinements.sql).
  quantity_delivered: z.coerce
    .number()
    .int("Quantity delivered must be a whole number")
    .positive("Quantity delivered must be greater than 0"),
  event_date: z.string().min(1, "Event date is required"),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export type RecordFulfillmentEventInput = z.infer<
  typeof recordFulfillmentEventSchema
>;

// "pending"/"in_progress" are never a valid target for a manual status
// change — pending->in_progress only happens automatically when the first
// event is recorded (see record_fulfillment_event). Reopen targets
// "in_progress" from a terminal state, so it's included here; the RPC is
// the source of truth for which transitions are actually valid from a
// given current status.
export const updateFulfillmentStatusSchema = z.object({
  status: z.enum(FULFILLMENT_STATUSES),
});

export type UpdateFulfillmentStatusInput = z.infer<
  typeof updateFulfillmentStatusSchema
>;
