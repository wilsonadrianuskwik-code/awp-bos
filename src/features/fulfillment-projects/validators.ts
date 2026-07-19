import { z } from "zod/v4";
import { FULFILLMENT_PROJECT_STATUSES, DELIVERABLE_STATUSES } from "@/features/fulfillment-projects/types";

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

// Bounds match the server-side guard in bulk_generate_fulfillment_deliverables
// (00054_fulfillment_deliverables.sql) — a row that passes here always
// passes there too.
export const bulkGenerateDeliverablesSchema = z.object({
  start_date: z.string().min(1, "Start date is required"),
  frequency_days: z.coerce.number().int().min(1).max(365),
  count: z.coerce.number().int().min(1).max(200),
  title_template: z.string().max(200).optional().or(z.literal("")),
  fulfillment_item_id: z.string().uuid().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
});

export type BulkGenerateDeliverablesInput = z.infer<
  typeof bulkGenerateDeliverablesSchema
>;

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
