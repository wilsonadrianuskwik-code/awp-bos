import { z } from "zod/v4";
import { FULFILLMENT_PROJECT_STATUSES, DELIVERABLE_STATUSES } from "@/features/fulfillment/types-projects";

export const updateFulfillmentProjectSchema = z
  .object({
    name: z.string().max(200).optional().or(z.literal("")),
    start_date: z.string().optional().or(z.literal("")),
    end_date: z.string().optional().or(z.literal("")),
    notes: z.string().max(4000).optional().or(z.literal("")),
  })
  .refine(
    (v) => !v.start_date || !v.end_date || v.end_date >= v.start_date,
    { message: "End date cannot be before start date", path: ["end_date"] }
  );

export type UpdateFulfillmentProjectInput = z.infer<
  typeof updateFulfillmentProjectSchema
>;

export const updateFulfillmentProjectStatusSchema = z.object({
  status: z.enum(FULFILLMENT_PROJECT_STATUSES),
});

export type UpdateFulfillmentProjectStatusInput = z.infer<
  typeof updateFulfillmentProjectStatusSchema
>;

export const assignFulfillmentProjectSchema = z.object({
  assigned_to: z.string().uuid().nullable(),
});

export type AssignFulfillmentProjectInput = z.infer<
  typeof assignFulfillmentProjectSchema
>;

export const createDeliverableSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  scheduled_date: z.string().min(1, "Scheduled date is required"),
  description: z.string().max(2000).optional().or(z.literal("")),
  fulfillment_item_id: z.string().uuid().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export type CreateDeliverableInput = z.infer<typeof createDeliverableSchema>;

export const rescheduleDeliverableSchema = z.object({
  scheduled_date: z.string().min(1, "Scheduled date is required"),
});

export type RescheduleDeliverableInput = z.infer<
  typeof rescheduleDeliverableSchema
>;

export const updateDeliverableStatusSchema = z.object({
  status: z.enum(DELIVERABLE_STATUSES),
});

export type UpdateDeliverableStatusInput = z.infer<
  typeof updateDeliverableStatusSchema
>;

export const assignDeliverableSchema = z.object({
  assigned_to: z.string().uuid().nullable(),
});

export type AssignDeliverableInput = z.infer<typeof assignDeliverableSchema>;

// Bulk actions (List view multi-select toolbar) — one RPC call per batch,
// not an N-way fan-out (P7-13 convention).
export const bulkUpdateDeliverableStatusSchema = z.object({
  deliverable_ids: z.array(z.string().uuid()).min(1, "Select at least one deliverable"),
  status: z.enum(DELIVERABLE_STATUSES),
});

export type BulkUpdateDeliverableStatusInput = z.infer<
  typeof bulkUpdateDeliverableStatusSchema
>;

export const bulkRescheduleDeliverablesSchema = z.object({
  deliverable_ids: z.array(z.string().uuid()).min(1, "Select at least one deliverable"),
  scheduled_date: z.string().min(1, "Scheduled date is required"),
});

export type BulkRescheduleDeliverablesInput = z.infer<
  typeof bulkRescheduleDeliverablesSchema
>;

export const bulkAssignDeliverablesSchema = z.object({
  deliverable_ids: z.array(z.string().uuid()).min(1, "Select at least one deliverable"),
  assigned_to: z.string().uuid().nullable(),
});

export type BulkAssignDeliverablesInput = z.infer<typeof bulkAssignDeliverablesSchema>;

export const bulkDeleteDeliverablesSchema = z.object({
  deliverable_ids: z.array(z.string().uuid()).min(1, "Select at least one deliverable"),
});

export type BulkDeleteDeliverablesInput = z.infer<typeof bulkDeleteDeliverablesSchema>;

// Backs the Generate Schedule wizard — an explicit, already-computed (and
// possibly hand-edited) list of rows, unlike bulkGenerateDeliverablesSchema's
// fixed frequency/count which can't represent an edited preview or the
// "Custom" method.
export const bulkCreateDeliverableItemSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  scheduled_date: z.string().min(1, "Scheduled date is required"),
  description: z.string().max(2000).optional().or(z.literal("")),
  fulfillment_item_id: z.string().uuid().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
});

export const bulkCreateDeliverablesSchema = z.object({
  items: z.array(bulkCreateDeliverableItemSchema).min(1).max(200),
});

export type BulkCreateDeliverablesInput = z.infer<
  typeof bulkCreateDeliverablesSchema
>;
