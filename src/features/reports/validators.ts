import { z } from "zod/v4";
import { REPORT_GRANULARITIES } from "@/features/reports/types";

export const revenueByPeriodSchema = z.object({
  currency: z.string().length(3),
  granularity: z.enum(REPORT_GRANULARITIES),
  fromDate: z.string().min(1, "Start date is required"),
  toDate: z.string().min(1, "End date is required"),
});

export const arAgingSchema = z.object({
  currency: z.string().length(3),
});

export type RevenueByPeriodInput = z.infer<typeof revenueByPeriodSchema>;
export type ArAgingInput = z.infer<typeof arAgingSchema>;
