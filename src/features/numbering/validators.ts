import { z } from "zod/v4";
import {
  NUMBERING_DOCUMENT_TYPES,
  RESET_CADENCES,
  SEQUENCE_SCOPES,
} from "@/features/numbering/types";

export const upsertNumberingTemplateSchema = z.object({
  document_type: z.enum(NUMBERING_DOCUMENT_TYPES),
  template: z
    .string()
    .min(1, "Template is required")
    .max(255)
    .regex(/\{SEQ:\d+\}/, "Template must include a {SEQ:n} sequence placeholder"),
  reset_cadence: z.enum(RESET_CADENCES),
  sequence_scope: z.enum(SEQUENCE_SCOPES),
});

export type UpsertNumberingTemplateInput = z.infer<typeof upsertNumberingTemplateSchema>;
